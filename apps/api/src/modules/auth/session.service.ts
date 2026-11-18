import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AuthSessionResponse,
  AuthSessionResponseSchema,
  type MfaMethod,
  type SessionAuthState,
  type TrainerProfile,
  TrainerProfileSchema,
} from '@pokeverse/shared';
import type { ApiEnvConfig } from '../../config/env.schema';
import { CryptoService } from '../../common/security/crypto.service';
import { RedisService } from '../../infra/redis.service';

export interface SessionTrainerRecord {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
  readonly mfaEnabled: boolean;
  readonly passwordHash: string | null;
  readonly badgesCount: number;
  readonly eloRating: number;
  readonly lastMapId: string;
  readonly lastX: number;
  readonly lastY: number;
  readonly createdAt: Date;
}

export interface ActiveRedisSession {
  readonly sidHash: string;
  readonly trainerId: string;
  readonly username: string;
  readonly familyId: string;
  readonly state: SessionAuthState;
  readonly mfaMethods: readonly MfaMethod[];
  readonly createdAt: string;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly redis: RedisService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<ApiEnvConfig, true>,
  ) {}

  getCookieNames(): {
    readonly sessionCookieName: string;
    readonly refreshCookieName: string;
    readonly secure: boolean;
    readonly sameSite: 'lax' | 'strict' | 'none';
    readonly domain?: string;
  } {
    const rawSecure = this.config.get('COOKIE_SECURE', { infer: true });
    const rawSameSite = this.config.get('COOKIE_SAMESITE', { infer: true });
    const sameSite =
      rawSameSite === 'none' || rawSameSite === 'strict' ? rawSameSite : 'lax';
    const rawDomain = (
      this.config.get('COOKIE_DOMAIN', { infer: true }) ?? ''
    ).trim();
    const secure = rawSecure || sameSite === 'none';
    const domain = rawDomain.length > 0 ? rawDomain : undefined;
    // RFC 6265bis: __Host- requires Secure, Path=/ and forbids Domain.
    const useHostPrefix = secure && !domain && sameSite !== 'none';

    return {
      sessionCookieName: useHostPrefix
        ? '__Host-pokeverse_session'
        : 'pokeverse_session',
      refreshCookieName: 'pokeverse_refresh',
      secure,
      sameSite,
      ...(domain ? { domain } : {}),
    };
  }

  getSessionTtlSec(): number {
    return this.config.get('SESSION_TTL_SEC', { infer: true });
  }

  getRefreshTtlDays(): number {
    return this.config.get('REFRESH_TTL_DAYS', { infer: true });
  }

  async createSession(input: {
    readonly trainerId: string;
    readonly username: string;
    readonly familyId: string;
    readonly state: SessionAuthState;
    readonly mfaMethods: readonly MfaMethod[];
  }): Promise<{
    readonly rawSid: string;
    readonly session: ActiveRedisSession;
  }> {
    const rawSid = randomBytes(32).toString('base64url');
    const sidHash = this.crypto.sha256Hex(rawSid);
    const ttlSec = this.getSessionTtlSec();

    const session: ActiveRedisSession = {
      sidHash,
      trainerId: input.trainerId,
      username: input.username,
      familyId: input.familyId,
      state: input.state,
      mfaMethods: input.mfaMethods,
      createdAt: new Date().toISOString(),
    };

    await this.redis.setJsonEx(this.sessionKey(sidHash), ttlSec, session);
    await this.redis.addToSetWithTtl(
      this.trainerSessionsKey(input.trainerId),
      sidHash,
      ttlSec + 60,
    );

    return { rawSid, session };
  }

  getSessionByRawSid(
    rawSid: string | undefined,
  ): Promise<ActiveRedisSession | null> {
    if (!rawSid || rawSid.length < 20) {
      return Promise.resolve(null);
    }

    const sidHash = this.crypto.sha256Hex(rawSid);
    return this.redis.getJson<ActiveRedisSession>(this.sessionKey(sidHash));
  }

  toTrainerProfile(row: SessionTrainerRecord): TrainerProfile {
    return TrainerProfileSchema.parse({
      id: row.id,
      username: row.username,
      email: row.email,
      emailVerifiedAt: row.emailVerifiedAt?.toISOString() ?? null,
      mfaEnabled: row.mfaEnabled,
      hasPassword: row.passwordHash !== null,
      badgesCount: row.badgesCount,
      eloRating: row.eloRating,
      lastMapId: row.lastMapId,
      lastX: row.lastX,
      lastY: row.lastY,
      createdAt: row.createdAt.toISOString(),
    });
  }

  buildAuthSessionResponse(
    trainer: SessionTrainerRecord,
    sessionState: SessionAuthState,
    mfaMethods: readonly MfaMethod[],
  ): AuthSessionResponse {
    return AuthSessionResponseSchema.parse({
      authenticated: true,
      sessionState,
      mfaMethods: [...mfaMethods],
      expiresInSec: this.getSessionTtlSec(),
      trainer: this.toTrainerProfile(trainer),
    });
  }

  async promoteToAuthenticated(
    rawSid: string,
  ): Promise<ActiveRedisSession | null> {
    const current = await this.getSessionByRawSid(rawSid);
    if (!current) {
      return null;
    }

    const promoted: ActiveRedisSession = {
      ...current,
      state: 'AUTHENTICATED',
    };
    const ttlSec = this.getSessionTtlSec();
    await this.redis.setJsonEx(
      this.sessionKey(current.sidHash),
      ttlSec,
      promoted,
    );
    return promoted;
  }

  async revokeByRawSid(rawSid: string | undefined): Promise<void> {
    if (!rawSid || rawSid.length < 20) {
      return;
    }
    const sidHash = this.crypto.sha256Hex(rawSid);
    await this.redis.delKeys(this.sessionKey(sidHash));
  }

  async revokeAllForTrainer(trainerId: string): Promise<void> {
    const indexKey = this.trainerSessionsKey(trainerId);
    const sidHashes = await this.redis.getSetMembers(indexKey);
    const keysToDelete = sidHashes.map((sidHash) => this.sessionKey(sidHash));
    keysToDelete.push(indexKey);
    await this.redis.delKeys(...keysToDelete);
  }

  private sessionKey(sidHash: string): string {
    return `sess:${sidHash}`;
  }

  private trainerSessionsKey(trainerId: string): string {
    return `trainer_sessions:${trainerId}`;
  }
}
