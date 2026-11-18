import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import {
  type AuthSessionResponse,
  AuthSessionResponseSchema,
  KAFKA_TOPICS,
  type LoginTrainerInput,
  type RegisterTrainerInput,
  type TrainerProfile,
  TrainerProfileSchema,
  WorldTickerEventSchema,
} from '@pokeverse/shared';
import * as argon2 from 'argon2';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../infra/prisma.service';

const TRAINER_PROFILE_SELECT = {
  id: true,
  username: true,
  email: true,
  badgesCount: true,
  eloRating: true,
  lastMapId: true,
  lastX: true,
  lastY: true,
  createdAt: true,
} as const;

export interface AuthIssueResult {
  readonly session: AuthSessionResponse;
  readonly refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<ApiEnvConfig, true>,
    private readonly logger: StructuredLoggerService,
  ) {}

  async register(
    input: RegisterTrainerInput,
    traceId: string | null,
  ): Promise<AuthIssueResult> {
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    const rawRefresh = this.generateOpaqueToken();
    const tokenHash = this.hashToken(rawRefresh);
    const familyId = randomUUID();
    const expiresAt = this.computeRefreshExpiry();

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const trainer = await tx.trainer.create({
          data: {
            username: input.username,
            email: input.email,
            passwordHash,
          },
          select: TRAINER_PROFILE_SELECT,
        });

        await tx.refreshToken.create({
          data: {
            trainerId: trainer.id,
            tokenHash,
            familyId,
            expiresAt,
          },
        });

        const eventId = randomUUID();
        const eventPayload = WorldTickerEventSchema.parse({
          eventId,
          eventType: 'trainer.registered',
          trainerId: trainer.id,
          username: trainer.username,
          summary: `${trainer.username} iniciou sua jornada em PokéVerse.`,
          occurredAt: new Date().toISOString(),
          traceId,
        });

        await tx.outboxEvent.create({
          data: {
            id: eventId,
            aggregateType: 'Trainer',
            aggregateId: trainer.id,
            eventType: KAFKA_TOPICS.WORLD_EVENTS,
            payload: eventPayload,
            status: 'PENDING',
          },
        });

        return trainer;
      });

      const session = await this.buildSessionResponse(created);
      return { session, refreshToken: rawRefresh };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Nome de treinador ou e-mail já cadastrado.',
        );
      }
      throw error;
    }
  }

  async login(input: LoginTrainerInput): Promise<AuthIssueResult> {
    const trainer = await this.prisma.trainer.findUnique({
      where: { email: input.email },
      select: {
        ...TRAINER_PROFILE_SELECT,
        passwordHash: true,
      },
    });

    if (!trainer) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const validPassword = await argon2.verify(
      trainer.passwordHash,
      input.password,
    );
    if (!validPassword) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const rawRefresh = this.generateOpaqueToken();
    const tokenHash = this.hashToken(rawRefresh);

    await this.prisma.refreshToken.create({
      data: {
        trainerId: trainer.id,
        tokenHash,
        familyId: randomUUID(),
        expiresAt: this.computeRefreshExpiry(),
      },
    });

    const { passwordHash: _omitted, ...safeProfile } = trainer;
    void _omitted;
    const session = await this.buildSessionResponse(safeProfile);
    return { session, refreshToken: rawRefresh };
  }

  async refresh(rawRefreshToken: string | undefined): Promise<AuthIssueResult> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token ausente.');
    }

    const tokenHash = this.hashToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        trainerId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        trainer: {
          select: TRAINER_PROFILE_SELECT,
        },
      },
    });

    if (!existing) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }

    if (existing.revokedAt !== null) {
      // Reuse of a rotated token compromises the whole token family.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.emitEvent(
        'warn',
        `Refresh token reuse detected for trainer ${existing.trainerId}`,
        {
          context: AuthService.name,
          errorCode: 'REFRESH_REUSE_DETECTED',
        },
      );
      throw new UnauthorizedException(
        'Sessão revogada por segurança. Faça login novamente.',
      );
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Sessão expirada.');
    }

    const nextRawRefresh = this.generateOpaqueToken();
    const nextHash = this.hashToken(nextRawRefresh);

    const rotated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (updated.count !== 1) {
        return false;
      }

      await tx.refreshToken.create({
        data: {
          trainerId: existing.trainerId,
          tokenHash: nextHash,
          familyId: existing.familyId,
          expiresAt: this.computeRefreshExpiry(),
        },
      });
      return true;
    });

    if (!rotated) {
      throw new UnauthorizedException('Sessão concorrente revogada.');
    }

    const session = await this.buildSessionResponse(existing.trainer);
    return { session, refreshToken: nextRawRefresh };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    const tokenHash = this.hashToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { familyId: true },
    });

    if (existing) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  async getMe(trainerId: string): Promise<TrainerProfile> {
    const trainer = await this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: TRAINER_PROFILE_SELECT,
    });

    if (!trainer) {
      throw new UnauthorizedException('Treinador não encontrado.');
    }

    return TrainerProfileSchema.parse({
      ...trainer,
      createdAt: trainer.createdAt.toISOString(),
    });
  }

  private async buildSessionResponse(trainerRow: {
    readonly id: string;
    readonly username: string;
    readonly email: string;
    readonly badgesCount: number;
    readonly eloRating: number;
    readonly lastMapId: string;
    readonly lastX: number;
    readonly lastY: number;
    readonly createdAt: Date;
  }): Promise<AuthSessionResponse> {
    const expiresInSec = this.config.get('JWT_ACCESS_TTL_SEC', { infer: true });
    const accessToken = await this.jwtService.signAsync(
      { sub: trainerRow.id, username: trainerRow.username },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: expiresInSec,
      },
    );

    return AuthSessionResponseSchema.parse({
      accessToken,
      expiresInSec,
      trainer: {
        id: trainerRow.id,
        username: trainerRow.username,
        email: trainerRow.email,
        badgesCount: trainerRow.badgesCount,
        eloRating: trainerRow.eloRating,
        lastMapId: trainerRow.lastMapId,
        lastX: trainerRow.lastX,
        lastY: trainerRow.lastY,
        createdAt: trainerRow.createdAt.toISOString(),
      },
    });
  }

  private generateOpaqueToken(): string {
    return randomBytes(48).toString('hex');
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private computeRefreshExpiry(): Date {
    const days = this.config.get('JWT_REFRESH_TTL_DAYS', { infer: true });
    return new Date(Date.now() + days * 86_400_000);
  }
}
