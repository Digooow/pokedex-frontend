import { randomBytes, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthSessionResponse, MfaMethod } from '@pokeverse/shared';
import { CryptoService } from '../../common/security/crypto.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import { AuthTokenRepository } from './auth-token.repository';
import { type SessionTrainerRecord, SessionService } from './session.service';
import type { TrainerAuthRecord } from './trainer-account.repository';

export interface AuthSessionWithCookies {
  readonly session: AuthSessionResponse;
  readonly sessionSid: string;
  readonly refreshToken: string | null;
}

export interface IssuedTrainerSession extends AuthSessionWithCookies {
  readonly requiresMfa: boolean;
}

export function resolveProvidersAvailability(
  config: ConfigService<ApiEnvConfig, true>,
): {
  readonly googleEnabled: boolean;
  readonly webauthnEnabled: boolean;
} {
  const googleId = config.get('GOOGLE_CLIENT_ID', { infer: true }).trim();
  const googleSecret = config
    .get('GOOGLE_CLIENT_SECRET', { infer: true })
    .trim();
  return {
    googleEnabled: Boolean(googleId && googleSecret),
    webauthnEnabled: true,
  };
}

@Injectable()
export class TrainerSessionIssuer {
  constructor(
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly crypto: CryptoService,
    private readonly sessionService: SessionService,
    private readonly config: ConfigService<ApiEnvConfig, true>,
  ) {}

  resolveMfaMethods(trainer: {
    readonly mfaEnabled: boolean;
    readonly totpSecretEncrypted: string | null;
    readonly passkeys: readonly { readonly id: string }[];
  }): MfaMethod[] {
    const mfaMethods: MfaMethod[] = [];
    if (trainer.mfaEnabled && trainer.totpSecretEncrypted) {
      mfaMethods.push('totp', 'backup_code');
    }
    if (trainer.mfaEnabled && trainer.passkeys.length > 0) {
      mfaMethods.push('passkey');
    }
    return mfaMethods;
  }

  generateOpaqueRefreshToken(): string {
    return randomBytes(48).toString('hex');
  }

  computeRefreshExpiry(): Date {
    const days = this.config.get('REFRESH_TTL_DAYS', { infer: true });
    return new Date(Date.now() + days * 86_400_000);
  }

  async createRefreshTokenRecord(
    trainerId: string,
    familyId: string,
  ): Promise<string> {
    const rawRefresh = this.generateOpaqueRefreshToken();
    await this.authTokenRepository.createRefreshToken({
      trainerId,
      tokenHash: this.crypto.sha256Hex(rawRefresh),
      familyId,
      expiresAt: this.computeRefreshExpiry(),
    });
    return rawRefresh;
  }

  async issueAuthenticatedOrMfaSession(
    trainer: TrainerAuthRecord,
  ): Promise<IssuedTrainerSession> {
    const mfaMethods = this.resolveMfaMethods(trainer);
    const requiresMfa = trainer.mfaEnabled && mfaMethods.length > 0;
    const familyId = randomUUID();
    const rawRefresh = requiresMfa
      ? null
      : await this.createRefreshTokenRecord(trainer.id, familyId);

    const { rawSid, session } = await this.sessionService.createSession({
      trainerId: trainer.id,
      username: trainer.username,
      role: trainer.role ?? 'TRAINER',
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
      requiresMfa,
    };
  }

  async promoteMfaPendingSession(
    rawSid: string,
    trainer: SessionTrainerRecord,
  ): Promise<{
    readonly session: AuthSessionResponse;
    readonly refreshToken: string;
  }> {
    const promoted = await this.sessionService.promoteToAuthenticated(rawSid);
    if (!promoted) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    const refreshToken = await this.createRefreshTokenRecord(
      trainer.id,
      promoted.familyId,
    );

    const session = this.sessionService.buildAuthSessionResponse(
      trainer,
      'AUTHENTICATED',
      promoted.mfaMethods,
    );

    return { session, refreshToken };
  }
}
