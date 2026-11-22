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
import { AuthTokenRepository } from './auth-token.repository';
import { SessionService } from './session.service';
import { TrainerAccountRepository } from './trainer-account.repository';
import { resolveProvidersAvailability } from './trainer-session-issuer.service';

const RETENTION_WINDOW_MS = 7 * 86_400_000;

@Injectable()
export class SessionManagementService {
  constructor(
    private readonly trainerAccountRepository: TrainerAccountRepository,
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly sessionService: SessionService,
    private readonly config: ConfigService<ApiEnvConfig, true>,
  ) {}

  async getSecurityOverview(
    trainerId: string,
  ): Promise<SecurityOverviewResponse> {
    const trainer =
      await this.trainerAccountRepository.findSecurityOverviewById(trainerId);

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
    const rows =
      await this.authTokenRepository.listActiveSessionFamilies(trainerId);

    const sessions = rows.map((row) => ({
      familyId: row.familyId,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      isCurrent: row.familyId === currentFamilyId,
    }));

    return ActiveSessionsResponseSchema.parse({ sessions });
  }

  async revokeOtherSessions(
    trainerId: string,
    currentFamilyId: string,
  ): Promise<RevokeOtherSessionsResponse> {
    const dbRevoked = await this.authTokenRepository.revokeOtherFamilies(
      trainerId,
      currentFamilyId,
    );

    const redisRevoked =
      await this.sessionService.revokeOtherSessionsForTrainer(
        trainerId,
        currentFamilyId,
      );
    const revokedCount = Math.max(dbRevoked, redisRevoked);

    return RevokeOtherSessionsResponseSchema.parse({
      revokedCount,
      message:
        revokedCount > 0
          ? `${revokedCount} outra(s) sessão(ões) encerrada(s) com sucesso.`
          : 'Nenhuma outra sessão ativa encontrada.',
    });
  }

  purgeExpiredTokensAndEvents(now: Date = new Date()): Promise<{
    readonly deletedRefreshTokens: number;
    readonly deletedOutboxEvents: number;
  }> {
    const cutoff = new Date(now.getTime() - RETENTION_WINDOW_MS);
    return this.authTokenRepository.purgeExpiredTokensAndPublishedOutbox(
      cutoff,
    );
  }
}
