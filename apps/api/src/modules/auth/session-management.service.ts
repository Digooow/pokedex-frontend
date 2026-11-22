import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type ActiveSessionsResponse,
  ActiveSessionsResponseSchema,
  type RevokeOtherSessionsResponse,
  RevokeOtherSessionsResponseSchema,
  type SecurityOverviewResponse,
  SecurityOverviewResponseSchema,
} from '@pokeverse/shared';
import type { ApiEnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../infra/prisma.service';
import { SessionService } from './session.service';
import { resolveProvidersAvailability } from './trainer-session-issuer.service';

const RETENTION_WINDOW_MS = 7 * 86_400_000;

@Injectable()
export class SessionManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly config: ConfigService<ApiEnvConfig, true>,
  ) {}

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

    const providers = resolveProvidersAvailability(this.config);
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
      if (!byFamily.has(row.familyId)) {
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

  async purgeExpiredTokensAndEvents(now: Date = new Date()): Promise<{
    readonly deletedRefreshTokens: number;
    readonly deletedOutboxEvents: number;
  }> {
    const cutoff = new Date(now.getTime() - RETENTION_WINDOW_MS);

    const [tokensResult, outboxResult] = await Promise.all([
      this.prisma.refreshToken.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
        },
      }),
      this.prisma.outboxEvent.deleteMany({
        where: {
          status: 'PUBLISHED',
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
