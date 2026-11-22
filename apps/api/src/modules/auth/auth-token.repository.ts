import { Injectable } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma.service';
import type { SessionTrainerRecord } from './session.service';
import { TRAINER_SESSION_SELECT } from './trainer-account.repository';

export const MAX_ACTIVE_SESSION_FAMILIES = 50;

export interface CreateRefreshTokenParams {
  readonly trainerId: string;
  readonly tokenHash: string;
  readonly familyId: string;
  readonly expiresAt: Date;
}

export interface PersistedRefreshTokenWithTrainer {
  readonly id: string;
  readonly trainerId: string;
  readonly familyId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly trainer: SessionTrainerRecord;
}

export interface RotateRefreshTokenParams {
  readonly existingId: string;
  readonly trainerId: string;
  readonly familyId: string;
  readonly nextTokenHash: string;
  readonly nextExpiresAt: Date;
}

export interface ActiveSessionFamilyRow {
  readonly familyId: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface PurgeExpiredResult {
  readonly deletedRefreshTokens: number;
  readonly deletedOutboxEvents: number;
}

@Injectable()
export class AuthTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createRefreshToken(params: CreateRefreshTokenParams): Promise<void> {
    await this.prisma.refreshToken.create({
      data: {
        trainerId: params.trainerId,
        tokenHash: params.tokenHash,
        familyId: params.familyId,
        expiresAt: params.expiresAt,
      },
    });
  }

  findByTokenHashWithTrainer(
    tokenHash: string,
  ): Promise<PersistedRefreshTokenWithTrainer | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        trainerId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        trainer: {
          select: TRAINER_SESSION_SELECT,
        },
      },
    });
  }

  rotateRefreshToken(params: RotateRefreshTokenParams): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.refreshToken.updateMany({
        where: { id: params.existingId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (updated.count !== 1) {
        return false;
      }

      await tx.refreshToken.create({
        data: {
          trainerId: params.trainerId,
          tokenHash: params.nextTokenHash,
          familyId: params.familyId,
          expiresAt: params.nextExpiresAt,
        },
      });
      return true;
    });
  }

  async findFamilyIdByTokenHash(tokenHash: string): Promise<string | null> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { familyId: true },
    });
    return existing?.familyId ?? null;
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  listActiveSessionFamilies(
    trainerId: string,
    now: Date = new Date(),
    limit: number = MAX_ACTIVE_SESSION_FAMILIES,
  ): Promise<ActiveSessionFamilyRow[]> {
    return this.prisma.refreshToken.findMany({
      where: {
        trainerId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      distinct: ['familyId'],
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        familyId: true,
        createdAt: true,
        expiresAt: true,
      },
    });
  }

  async revokeOtherFamilies(
    trainerId: string,
    currentFamilyId: string,
  ): Promise<number> {
    const updated = await this.prisma.refreshToken.updateMany({
      where: {
        trainerId,
        revokedAt: null,
        familyId: { not: currentFamilyId },
      },
      data: { revokedAt: new Date() },
    });
    return updated.count;
  }

  async purgeExpiredTokensAndPublishedOutbox(
    cutoff: Date,
  ): Promise<PurgeExpiredResult> {
    const [tokensResult, outboxResult] = await Promise.all([
      this.prisma.refreshToken.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
        },
      }),
      this.prisma.outboxEvent.deleteMany({
        where: {
          status: OutboxStatus.PUBLISHED,
          createdAt: { lt: cutoff },
        },
      }),
    ]);

    return {
      deletedRefreshTokens: tokensResult.count,
      deletedOutboxEvents: outboxResult.count,
    };
  }
}
