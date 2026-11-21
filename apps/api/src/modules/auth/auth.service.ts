import { randomBytes, randomUUID } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  type ActiveSessionsResponse,
  ActiveSessionsResponseSchema,
  type AuthSessionResponse,
  type EmailNotificationEvent,
  EmailNotificationEventSchema,
  EncryptedOutboxPayloadSchema,
  type ForgotPasswordInput,
  KAFKA_TOPICS,
  type LoginTrainerInput,
  type MfaMethod,
  type RegisterTrainerInput,
  type ResendEmailOtpInput,
  type ResetPasswordOtpInput,
  type RevokeOtherSessionsResponse,
  RevokeOtherSessionsResponseSchema,
  type SecurityOverviewResponse,
  SecurityOverviewResponseSchema,
  type SessionBootstrapResponse,
  SessionBootstrapResponseSchema,
  type TrainerDataExport,
  TrainerDataExportSchema,
  type TrainerProfile,
  type VerifyEmailOtpInput,
  WorldTickerEventSchema,
} from '@pokeverse/shared';
import * as argon2 from 'argon2';
import { CryptoService } from '../../common/security/crypto.service';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { OtpService } from './otp.service';
import { type SessionTrainerRecord, SessionService } from './session.service';

const TRAINER_PROFILE_SELECT = {
  id: true,
  username: true,
  email: true,
  emailVerifiedAt: true,
  mfaEnabled: true,
  badgesCount: true,
  eloRating: true,
  lastMapId: true,
  lastX: true,
  lastY: true,
  createdAt: true,
} as const;

const LOGIN_MAX_FAILURES = 8;
const LOGIN_LOCK_WINDOW_SEC = 300;
const REFRESH_GRACE_TTL_SEC = 10;

interface RefreshGraceEnvelope {
  readonly trainerId: string;
  readonly familyId: string;
  readonly sessionSid: string;
  readonly refreshToken: string;
}

export interface AuthSessionWithCookies {
  readonly session: AuthSessionResponse;
  readonly sessionSid: string;
  readonly refreshToken: string | null;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyPasswordHash: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly crypto: CryptoService,
    private readonly sessionService: SessionService,
    private readonly otpService: OtpService,
    private readonly config: ConfigService<ApiEnvConfig, true>,
    private readonly logger: StructuredLoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await argon2.hash('pokeverse-timing-shield-key', {
      type: argon2.argon2id,
    });
  }

  async register(
    input: RegisterTrainerInput,
    traceId: string | null,
  ): Promise<AuthSessionWithCookies> {
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    const rawRefresh = this.generateOpaqueToken();
    const tokenHash = this.crypto.sha256Hex(rawRefresh);
    const familyId = randomUUID();
    const expiresAt = this.computeRefreshExpiry();

    const otpDraft = this.otpService.createOtpDraft('verify', input.email);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const trainer = await tx.trainer.create({
          data: {
            username: input.username,
            email: input.email,
            passwordHash,
          },
          select: { ...TRAINER_PROFILE_SELECT, passwordHash: true },
        });

        await tx.refreshToken.create({
          data: {
            trainerId: trainer.id,
            tokenHash,
            familyId,
            expiresAt,
          },
        });

        const worldEventId = randomUUID();
        const worldPayload = WorldTickerEventSchema.parse({
          eventId: worldEventId,
          eventType: 'trainer.registered',
          trainerId: trainer.id,
          username: trainer.username,
          summary: `${trainer.username} iniciou sua jornada em PokéVerse.`,
          occurredAt: new Date().toISOString(),
          traceId,
        });

        await tx.outboxEvent.create({
          data: {
            id: worldEventId,
            aggregateType: 'Trainer',
            aggregateId: trainer.id,
            eventType: KAFKA_TOPICS.WORLD_EVENTS,
            payload: worldPayload,
            status: 'PENDING',
          },
        });

        await this.enqueueEncryptedEmail(tx, {
          aggregateId: trainer.id,
          template: 'email_verification_otp',
          toEmail: trainer.email,
          username: trainer.username,
          subject: 'PokéVerse OS — Código de verificação de conta',
          otpCode: otpDraft.code,
          traceId,
        });

        return trainer;
      });

      await this.otpService.persistOtpDraft(otpDraft);

      const { rawSid, session } = await this.sessionService.createSession({
        trainerId: created.id,
        username: created.username,
        familyId,
        state: 'AUTHENTICATED',
        mfaMethods: [],
      });

      return {
        session: this.sessionService.buildAuthSessionResponse(
          created,
          session.state,
          session.mfaMethods,
        ),
        sessionSid: rawSid,
        refreshToken: rawRefresh,
      };
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

  async login(
    input: LoginTrainerInput,
    clientIp: string,
  ): Promise<AuthSessionWithCookies> {
    const attemptKey = this.loginAttemptKey(clientIp, input.email);
    const currentAttempts = Number(
      (await this.redis.getString(attemptKey)) ?? '0',
    );
    if (currentAttempts >= LOGIN_MAX_FAILURES) {
      this.logger.emitEvent(
        'warn',
        `Login rate guard blocked excessive failed attempts from ${clientIp}`,
        { context: AuthService.name, errorCode: 'LOGIN_RATE_LIMIT_HIT' },
      );
      throw new HttpException(
        'Muitas tentativas de login falharam. Aguarde alguns minutos e tente novamente.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const trainer = await this.prisma.trainer.findUnique({
      where: { email: input.email },
      select: {
        ...TRAINER_PROFILE_SELECT,
        passwordHash: true,
        totpSecretEncrypted: true,
        passkeys: { select: { id: true }, take: 1 },
      },
    });

    if (!trainer?.passwordHash) {
      const dummyHash = await this.getDummyHash();
      await argon2.verify(dummyHash, input.password).catch(() => false);
      await this.recordFailedLogin(attemptKey, currentAttempts);
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const validPassword = await argon2.verify(
      trainer.passwordHash,
      input.password,
    );
    if (!validPassword) {
      await this.recordFailedLogin(attemptKey, currentAttempts);
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    await this.redis.delKeys(attemptKey);

    const mfaMethods: MfaMethod[] = [];
    if (trainer.mfaEnabled && trainer.totpSecretEncrypted) {
      mfaMethods.push('totp', 'backup_code');
    }
    if (trainer.mfaEnabled && trainer.passkeys.length > 0) {
      mfaMethods.push('passkey');
    }

    const requiresMfa = trainer.mfaEnabled && mfaMethods.length > 0;
    const familyId = randomUUID();
    let rawRefresh: string | null = null;

    if (!requiresMfa) {
      rawRefresh = this.generateOpaqueToken();
      await this.prisma.refreshToken.create({
        data: {
          trainerId: trainer.id,
          tokenHash: this.crypto.sha256Hex(rawRefresh),
          familyId,
          expiresAt: this.computeRefreshExpiry(),
        },
      });
    }

    const { rawSid, session } = await this.sessionService.createSession({
      trainerId: trainer.id,
      username: trainer.username,
      familyId,
      state: requiresMfa ? 'MFA_PENDING' : 'AUTHENTICATED',
      mfaMethods,
    });

    return {
      session: this.sessionService.buildAuthSessionResponse(
        trainer,
        session.state,
        session.mfaMethods,
      ),
      sessionSid: rawSid,
      refreshToken: rawRefresh,
    };
  }

  async getSessionBootstrap(
    rawSid: string | undefined,
    rawRefreshToken: string | undefined,
  ): Promise<SessionBootstrapResponse> {
    const activeSession = await this.sessionService.getSessionByRawSid(rawSid);
    if (!activeSession) {
      return SessionBootstrapResponseSchema.parse({
        authenticated: false,
        canRefresh: Boolean(rawRefreshToken && rawRefreshToken.length >= 20),
      });
    }

    const trainer = await this.prisma.trainer.findUnique({
      where: { id: activeSession.trainerId },
      select: { ...TRAINER_PROFILE_SELECT, passwordHash: true },
    });

    if (!trainer) {
      await this.sessionService.revokeByRawSid(rawSid);
      return SessionBootstrapResponseSchema.parse({
        authenticated: false,
        canRefresh: false,
      });
    }

    return this.sessionService.buildAuthSessionResponse(
      trainer,
      activeSession.state,
      activeSession.mfaMethods,
    );
  }

  async refresh(
    rawRefreshToken: string | undefined,
    previousRawSid?: string,
  ): Promise<AuthSessionWithCookies> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token ausente.');
    }

    const tokenHash = this.crypto.sha256Hex(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        trainerId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        trainer: {
          select: { ...TRAINER_PROFILE_SELECT, passwordHash: true },
        },
      },
    });

    if (!existing) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }

    if (existing.revokedAt !== null) {
      if (existing.expiresAt.getTime() > Date.now()) {
        const graceResult = await this.tryResolveRefreshGrace(
          tokenHash,
          existing.trainer,
          existing.familyId,
        );
        if (graceResult) {
          return graceResult;
        }
      }

      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.sessionService.revokeAllForTrainer(existing.trainerId);
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
    const nextHash = this.crypto.sha256Hex(nextRawRefresh);

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

    await this.sessionService.revokeByRawSid(previousRawSid);

    const { rawSid, session } = await this.sessionService.createSession({
      trainerId: existing.trainer.id,
      username: existing.trainer.username,
      familyId: existing.familyId,
      state: 'AUTHENTICATED',
      mfaMethods: [],
    });

    const graceToken = this.crypto.encryptJson({
      trainerId: existing.trainer.id,
      familyId: existing.familyId,
      sessionSid: rawSid,
      refreshToken: nextRawRefresh,
    } satisfies RefreshGraceEnvelope);
    await this.redis.setStringEx(
      this.refreshGraceKey(tokenHash),
      REFRESH_GRACE_TTL_SEC,
      graceToken,
    );

    return {
      session: this.sessionService.buildAuthSessionResponse(
        existing.trainer,
        session.state,
        session.mfaMethods,
      ),
      sessionSid: rawSid,
      refreshToken: nextRawRefresh,
    };
  }

  async logout(
    rawSid: string | undefined,
    rawRefreshToken: string | undefined,
  ): Promise<void> {
    await this.sessionService.revokeByRawSid(rawSid);

    if (!rawRefreshToken) {
      return;
    }

    const tokenHash = this.crypto.sha256Hex(rawRefreshToken);
    await this.redis.delKeys(this.refreshGraceKey(tokenHash));
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

  async verifyEmailOtp(
    input: VerifyEmailOtpInput,
    traceId: string | null,
  ): Promise<{ readonly message: string }> {
    const valid = await this.otpService.verifyAndConsumeOtp(
      'verify',
      input.email,
      input.code,
    );
    if (!valid) {
      throw new BadRequestException(
        'Código de verificação inválido, expirado ou tentativas esgotadas.',
      );
    }

    const trainer = await this.prisma.trainer.findUnique({
      where: { email: input.email },
      select: { id: true, username: true, email: true, emailVerifiedAt: true },
    });

    if (trainer?.emailVerifiedAt === null) {
      await this.prisma.$transaction(async (tx) => {
        await tx.trainer.update({
          where: { id: trainer.id },
          data: { emailVerifiedAt: new Date() },
        });
        await this.enqueueEncryptedEmail(tx, {
          aggregateId: trainer.id,
          template: 'welcome',
          toEmail: trainer.email,
          username: trainer.username,
          subject: 'PokéVerse OS — Conta de treinador verificada!',
          traceId,
        });
      });
    }

    return { message: 'E-mail verificado com sucesso.' };
  }

  async resendVerificationOtp(
    input: ResendEmailOtpInput,
    traceId: string | null,
  ): Promise<{ readonly message: string }> {
    const trainer = await this.prisma.trainer.findUnique({
      where: { email: input.email },
      select: { id: true, username: true, email: true, emailVerifiedAt: true },
    });

    if (trainer?.emailVerifiedAt === null) {
      const { code: otpCode } = await this.otpService.issueOtp(
        'verify',
        trainer.email,
      );
      await this.prisma.$transaction(async (tx) => {
        await this.enqueueEncryptedEmail(tx, {
          aggregateId: trainer.id,
          template: 'email_verification_otp',
          toEmail: trainer.email,
          username: trainer.username,
          subject: 'PokéVerse OS — Novo código de verificação',
          otpCode,
          traceId,
        });
      });
    }

    return {
      message:
        'Se o e-mail existir e ainda não estiver verificado, enviaremos um código de 6 dígitos.',
    };
  }

  async forgotPassword(
    input: ForgotPasswordInput,
    traceId: string | null,
  ): Promise<{ readonly message: string }> {
    const trainer = await this.prisma.trainer.findUnique({
      where: { email: input.email },
      select: { id: true, username: true, email: true },
    });

    if (trainer) {
      const { code: otpCode } = await this.otpService.issueOtp(
        'reset',
        trainer.email,
      );
      await this.prisma.$transaction(async (tx) => {
        await this.enqueueEncryptedEmail(tx, {
          aggregateId: trainer.id,
          template: 'password_reset_otp',
          toEmail: trainer.email,
          username: trainer.username,
          subject: 'PokéVerse OS — Código de recuperação de senha',
          otpCode,
          traceId,
        });
      });
    }

    return {
      message:
        'Se o e-mail estiver cadastrado, enviaremos um código de 6 dígitos válido por 10 minutos.',
    };
  }

  async resetPasswordWithOtp(
    input: ResetPasswordOtpInput,
    traceId: string | null,
  ): Promise<{ readonly message: string }> {
    const valid = await this.otpService.verifyAndConsumeOtp(
      'reset',
      input.email,
      input.code,
    );
    if (!valid) {
      throw new BadRequestException(
        'Código de recuperação inválido, expirado ou tentativas esgotadas.',
      );
    }

    const trainer = await this.prisma.trainer.findUnique({
      where: { email: input.email },
      select: { id: true, username: true, email: true },
    });

    if (!trainer) {
      throw new BadRequestException('Solicitação de recuperação inválida.');
    }

    const newHash = await argon2.hash(input.newPassword, {
      type: argon2.argon2id,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.trainer.update({
        where: { id: trainer.id },
        data: { passwordHash: newHash },
      });

      await tx.refreshToken.updateMany({
        where: { trainerId: trainer.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.enqueueEncryptedEmail(tx, {
        aggregateId: trainer.id,
        template: 'security_alert',
        toEmail: trainer.email,
        username: trainer.username,
        subject: 'PokéVerse OS — Senha alterada com sucesso',
        detail:
          'Sua senha foi redefinida com sucesso e todas as sessões ativas foram encerradas.',
        traceId,
      });
    });

    await this.sessionService.revokeAllForTrainer(trainer.id);

    return {
      message: 'Senha redefinida com sucesso. Faça login com a nova senha.',
    };
  }

  async getMe(trainerId: string): Promise<TrainerProfile> {
    const trainer = await this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: { ...TRAINER_PROFILE_SELECT, passwordHash: true },
    });

    if (!trainer) {
      throw new UnauthorizedException('Treinador não encontrado.');
    }

    return this.sessionService.toTrainerProfile(trainer);
  }

  getProvidersAvailability(): {
    readonly googleEnabled: boolean;
    readonly webauthnEnabled: boolean;
  } {
    const googleId = this.config
      .get('GOOGLE_CLIENT_ID', { infer: true })
      .trim();
    const googleSecret = this.config
      .get('GOOGLE_CLIENT_SECRET', { infer: true })
      .trim();
    return {
      googleEnabled: Boolean(googleId && googleSecret),
      webauthnEnabled: true,
    };
  }

  async getSecurityOverview(
    trainerId: string,
  ): Promise<SecurityOverviewResponse> {
    const trainer = await this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: {
        mfaEnabled: true,
        oauthAccounts: {
          where: { provider: 'google' },
          select: { email: true },
          take: 1,
        },
        passkeys: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            label: true,
            deviceType: true,
            backedUp: true,
            createdAt: true,
            lastUsedAt: true,
          },
        },
      },
    });

    if (!trainer) {
      throw new UnauthorizedException('Treinador não encontrado.');
    }

    const providers = this.getProvidersAvailability();
    const googleLink = trainer.oauthAccounts[0] ?? null;

    return SecurityOverviewResponseSchema.parse({
      providers: {
        googleEnabled: providers.googleEnabled,
        googleLinked: googleLink !== null,
        googleEmail: googleLink?.email ?? null,
        webauthnEnabled: providers.webauthnEnabled,
      },
      mfaEnabled: trainer.mfaEnabled,
      passkeys: trainer.passkeys.map((row) => ({
        id: row.id,
        label: row.label,
        deviceType: row.deviceType,
        backedUp: row.backedUp,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      })),
    });
  }

  async listActiveSessions(
    trainerId: string,
    currentFamilyId: string,
  ): Promise<ActiveSessionsResponse> {
    const rows = await this.prisma.refreshToken.findMany({
      where: {
        trainerId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        familyId: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    const byFamily = new Map<
      string,
      { readonly createdAt: Date; readonly expiresAt: Date }
    >();
    for (const row of rows) {
      const existing = byFamily.get(row.familyId);
      if (!existing) {
        byFamily.set(row.familyId, {
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
        });
      }
    }

    const sessions = Array.from(byFamily.entries()).map(([familyId, info]) => ({
      familyId,
      createdAt: info.createdAt.toISOString(),
      expiresAt: info.expiresAt.toISOString(),
      isCurrent: familyId === currentFamilyId,
    }));

    return ActiveSessionsResponseSchema.parse({ sessions });
  }

  async revokeOtherSessions(
    trainerId: string,
    currentFamilyId: string,
  ): Promise<RevokeOtherSessionsResponse> {
    const updated = await this.prisma.refreshToken.updateMany({
      where: {
        trainerId,
        revokedAt: null,
        familyId: { not: currentFamilyId },
      },
      data: { revokedAt: new Date() },
    });

    const redisRevoked =
      await this.sessionService.revokeOtherSessionsForTrainer(
        trainerId,
        currentFamilyId,
      );
    const revokedCount = Math.max(updated.count, redisRevoked);

    return RevokeOtherSessionsResponseSchema.parse({
      revokedCount,
      message:
        revokedCount > 0
          ? `${revokedCount} outra(s) sessão(ões) encerrada(s) com sucesso.`
          : 'Nenhuma outra sessão ativa encontrada.',
    });
  }

  async exportTrainerData(trainerId: string): Promise<TrainerDataExport> {
    const trainer = await this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: {
        ...TRAINER_PROFILE_SELECT,
        passwordHash: true,
        oauthAccounts: {
          orderBy: { createdAt: 'asc' },
          select: {
            provider: true,
            email: true,
            createdAt: true,
          },
        },
        passkeys: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            label: true,
            deviceType: true,
            backedUp: true,
            createdAt: true,
            lastUsedAt: true,
          },
        },
        pokedexSlots: {
          orderBy: { slotIndex: 'asc' },
          select: {
            slotIndex: true,
            pokemonId: true,
            pokemonName: true,
            nickname: true,
            spriteUrl: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!trainer) {
      throw new UnauthorizedException('Treinador não encontrado.');
    }

    return TrainerDataExportSchema.parse({
      exportedAt: new Date().toISOString(),
      trainer: this.sessionService.toTrainerProfile(trainer),
      oauthProviders: trainer.oauthAccounts.map((acc) => ({
        provider: acc.provider,
        email: acc.email,
        linkedAt: acc.createdAt.toISOString(),
      })),
      passkeys: trainer.passkeys.map((pk) => ({
        id: pk.id,
        label: pk.label,
        deviceType: pk.deviceType,
        backedUp: pk.backedUp,
        createdAt: pk.createdAt.toISOString(),
        lastUsedAt: pk.lastUsedAt?.toISOString() ?? null,
      })),
      pokedexSlots: trainer.pokedexSlots.map((slot) => ({
        slotIndex: slot.slotIndex,
        pokemonId: slot.pokemonId,
        pokemonName: slot.pokemonName,
        nickname: slot.nickname,
        spriteUrl: slot.spriteUrl,
        updatedAt: slot.updatedAt.toISOString(),
      })),
    });
  }

  private async tryResolveRefreshGrace(
    tokenHash: string,
    trainer: SessionTrainerRecord,
    familyId: string,
  ): Promise<AuthSessionWithCookies | null> {
    const rawEncrypted = await this.redis.getString(
      this.refreshGraceKey(tokenHash),
    );
    if (!rawEncrypted) {
      return null;
    }

    try {
      const grace = this.crypto.decryptJson<RefreshGraceEnvelope>(rawEncrypted);
      if (
        grace.trainerId !== trainer.id ||
        grace.familyId !== familyId ||
        !grace.sessionSid ||
        !grace.refreshToken
      ) {
        return null;
      }

      const activeGraceSession = await this.sessionService.getSessionByRawSid(
        grace.sessionSid,
      );
      if (
        activeGraceSession?.trainerId !== trainer.id ||
        activeGraceSession.familyId !== familyId
      ) {
        return null;
      }

      this.logger.emitEvent(
        'info',
        `Refresh grace window served concurrent request for trainer ${trainer.id}`,
        {
          context: AuthService.name,
          errorCode: 'REFRESH_GRACE_REPLAYED',
        },
      );

      return {
        session: this.sessionService.buildAuthSessionResponse(
          trainer,
          activeGraceSession.state,
          activeGraceSession.mfaMethods,
        ),
        sessionSid: grace.sessionSid,
        refreshToken: grace.refreshToken,
      };
    } catch {
      return null;
    }
  }

  private refreshGraceKey(tokenHash: string): string {
    return `refresh_grace:${tokenHash}`;
  }

  private async enqueueEncryptedEmail(
    tx: Prisma.TransactionClient,
    params: {
      readonly aggregateId: string;
      readonly template: EmailNotificationEvent['template'];
      readonly toEmail: string;
      readonly username: string;
      readonly subject: string;
      readonly otpCode?: string;
      readonly detail?: string;
      readonly traceId: string | null;
    },
  ): Promise<void> {
    const eventId = randomUUID();
    const emailEvent = EmailNotificationEventSchema.parse({
      eventId,
      template: params.template,
      toEmail: params.toEmail,
      username: params.username,
      subject: params.subject,
      ...(params.otpCode ? { otpCode: params.otpCode } : {}),
      ...(params.detail ? { detail: params.detail } : {}),
      requestedAt: new Date().toISOString(),
      traceId: params.traceId,
    });

    const encryptedEnvelope = EncryptedOutboxPayloadSchema.parse({
      version: 1,
      ciphertext: this.crypto.encryptJson(emailEvent),
    });

    await tx.outboxEvent.create({
      data: {
        id: eventId,
        aggregateType: 'EmailNotification',
        aggregateId: params.aggregateId,
        eventType: KAFKA_TOPICS.NOTIFICATIONS_EMAIL,
        payload: encryptedEnvelope,
        status: 'PENDING',
      },
    });
  }

  private async getDummyHash(): Promise<string> {
    this.dummyPasswordHash ??= await argon2.hash(
      'pokeverse-timing-shield-key',
      {
        type: argon2.argon2id,
      },
    );
    return this.dummyPasswordHash;
  }

  private async recordFailedLogin(
    attemptKey: string,
    currentAttempts: number,
  ): Promise<void> {
    if (typeof this.redis.incrementCounterWithTtl === 'function') {
      await this.redis.incrementCounterWithTtl(
        attemptKey,
        LOGIN_LOCK_WINDOW_SEC,
      );
      return;
    }
    await this.redis.setStringEx(
      attemptKey,
      LOGIN_LOCK_WINDOW_SEC,
      String(currentAttempts + 1),
    );
  }

  private loginAttemptKey(clientIp: string, email: string): string {
    const identityHash = this.crypto.sha256Hex(`${clientIp}:${email}`);
    return `login_fail:${identityHash}`;
  }

  private generateOpaqueToken(): string {
    return randomBytes(48).toString('hex');
  }

  private computeRefreshExpiry(): Date {
    const days = this.config.get('REFRESH_TTL_DAYS', { infer: true });
    return new Date(Date.now() + days * 86_400_000);
  }
}
