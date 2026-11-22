import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  type SessionBootstrapResponse,
  SessionBootstrapResponseSchema,
} from '@pokeverse/shared';
import { CryptoService } from '../../common/security/crypto.service';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import { RedisService } from '../../infra/redis.service';
import { AuthTokenRepository } from './auth-token.repository';
import { type SessionTrainerRecord, SessionService } from './session.service';
import { TrainerAccountRepository } from './trainer-account.repository';
import {
  type AuthSessionWithCookies,
  TrainerSessionIssuer,
} from './trainer-session-issuer.service';

const REFRESH_GRACE_TTL_SEC = 10;

interface RefreshGraceEnvelope {
  readonly trainerId: string;
  readonly familyId: string;
  readonly sessionSid: string;
  readonly refreshToken: string;
}

@Injectable()
export class TokenRefreshService {
  constructor(
    private readonly trainerAccountRepository: TrainerAccountRepository,
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly redis: RedisService,
    private readonly crypto: CryptoService,
    private readonly sessionService: SessionService,
    private readonly sessionIssuer: TrainerSessionIssuer,
    private readonly logger: StructuredLoggerService,
  ) {}

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

    const trainer = await this.trainerAccountRepository.findSessionRecordById(
      activeSession.trainerId,
    );

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
    const existing =
      await this.authTokenRepository.findByTokenHashWithTrainer(tokenHash);

    if (!existing) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }

    if (existing.revokedAt !== null) {
      return this.handleRevokedRefreshToken(existing, tokenHash);
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Sessão expirada.');
    }

    const nextRawRefresh = this.sessionIssuer.generateOpaqueRefreshToken();
    const nextHash = this.crypto.sha256Hex(nextRawRefresh);
    const nextExpiry = this.sessionIssuer.computeRefreshExpiry();

    const rotated = await this.authTokenRepository.rotateRefreshToken({
      existingId: existing.id,
      trainerId: existing.trainerId,
      familyId: existing.familyId,
      nextTokenHash: nextHash,
      nextExpiresAt: nextExpiry,
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
    const familyId =
      await this.authTokenRepository.findFamilyIdByTokenHash(tokenHash);

    if (familyId) {
      await this.authTokenRepository.revokeFamily(familyId);
    }
  }

  private async handleRevokedRefreshToken(
    existing: {
      readonly trainerId: string;
      readonly familyId: string;
      readonly expiresAt: Date;
      readonly trainer: SessionTrainerRecord;
    },
    tokenHash: string,
  ): Promise<AuthSessionWithCookies> {
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

    await this.authTokenRepository.revokeFamily(existing.familyId);
    await this.sessionService.revokeAllForTrainer(existing.trainerId);
    this.logger.emitEvent(
      'warn',
      `Refresh token reuse detected for trainer ${existing.trainerId}`,
      {
        context: TokenRefreshService.name,
        errorCode: 'REFRESH_REUSE_DETECTED',
      },
    );
    throw new UnauthorizedException(
      'Sessão revogada por segurança. Faça login novamente.',
    );
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
          context: TokenRefreshService.name,
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
}
