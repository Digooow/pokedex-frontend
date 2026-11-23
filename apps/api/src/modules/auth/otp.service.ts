import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from '../../common/security/crypto.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import { RedisService } from '../../infra/redis.service';

export type OtpPurpose = 'verify' | 'reset';

interface StoredOtpRecord {
  readonly codeHash: string;
  readonly attempts: number;
  readonly expiresAtMs: number;
}

export interface OtpDraft {
  readonly purpose: OtpPurpose;
  readonly normalizedEmail: string;
  readonly code: string;
  readonly expiresInSec: number;
  readonly record: StoredOtpRecord;
}

@Injectable()
export class OtpService {
  constructor(
    private readonly redis: RedisService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<ApiEnvConfig, true>,
  ) {}

  createOtpDraft(purpose: OtpPurpose, normalizedEmail: string): OtpDraft {
    const ttlSec = this.config.get('OTP_TTL_SEC', { infer: true });
    const code = String(randomInt(100_000, 1_000_000));
    const codeHash = this.crypto.hmacSha256Hex(
      this.hmacContext(purpose, normalizedEmail),
      code,
    );

    const record: StoredOtpRecord = {
      codeHash,
      attempts: 0,
      expiresAtMs: Date.now() + ttlSec * 1000,
    };

    return {
      purpose,
      normalizedEmail,
      code,
      expiresInSec: ttlSec,
      record,
    };
  }

  async persistOtpDraft(
    draft: OtpDraft,
  ): Promise<{ readonly code: string; readonly expiresInSec: number }> {
    await this.redis.setJsonEx(
      this.redisKey(draft.purpose, draft.normalizedEmail),
      draft.expiresInSec,
      draft.record,
    );
    await this.redis.delKeys(
      this.attemptsKey(draft.purpose, draft.normalizedEmail),
    );

    return { code: draft.code, expiresInSec: draft.expiresInSec };
  }

  async issueOtp(
    purpose: OtpPurpose,
    normalizedEmail: string,
  ): Promise<{ readonly code: string; readonly expiresInSec: number }> {
    const draft = this.createOtpDraft(purpose, normalizedEmail);
    return this.persistOtpDraft(draft);
  }

  async verifyAndConsumeOtp(
    purpose: OtpPurpose,
    normalizedEmail: string,
    candidateCode: string,
  ): Promise<boolean> {
    const key = this.redisKey(purpose, normalizedEmail);
    const attemptsKey = this.attemptsKey(purpose, normalizedEmail);
    const maxAttempts = this.config.get('OTP_MAX_ATTEMPTS', { infer: true });
    const record = await this.redis.getJson<StoredOtpRecord>(key);

    if (!record || Date.now() > record.expiresAtMs) {
      await this.redis.delKeys(key, attemptsKey);
      return false;
    }

    const rawAttemptCount =
      typeof this.redis.getString === 'function'
        ? await this.redis.getString(attemptsKey)
        : null;
    const trackedAttempts = Math.max(
      record.attempts,
      Number(rawAttemptCount ?? '0'),
    );

    if (trackedAttempts >= maxAttempts) {
      await this.redis.delKeys(key, attemptsKey);
      return false;
    }

    const expectedHash = this.crypto.hmacSha256Hex(
      this.hmacContext(purpose, normalizedEmail),
      candidateCode,
    );

    if (this.crypto.safeEqualHex(record.codeHash, expectedHash)) {
      const deleted = await this.redis.delKeys(key);
      await this.redis.delKeys(attemptsKey);
      return typeof deleted === 'number' ? deleted > 0 : true;
    }

    const remainingSec = Math.max(
      1,
      Math.ceil((record.expiresAtMs - Date.now()) / 1000),
    );

    if (typeof this.redis.incrementCounterWithTtl === 'function') {
      const nextAttempts = await this.redis.incrementCounterWithTtl(
        attemptsKey,
        remainingSec,
      );
      if (nextAttempts >= maxAttempts) {
        await this.redis.delKeys(key, attemptsKey);
      }
      return false;
    }

    const nextAttempts = record.attempts + 1;
    if (nextAttempts >= maxAttempts) {
      await this.redis.delKeys(key, attemptsKey);
      return false;
    }

    await this.redis.setJsonEx(key, remainingSec, {
      ...record,
      attempts: nextAttempts,
    } satisfies StoredOtpRecord);

    return false;
  }

  private hmacContext(purpose: OtpPurpose, email: string): string {
    return `otp:${purpose}:${email}`;
  }

  private redisKey(purpose: OtpPurpose, email: string): string {
    return `otp:${purpose}:${this.crypto.sha256Hex(email)}`;
  }

  private attemptsKey(purpose: OtpPurpose, email: string): string {
    return `otp_attempts:${purpose}:${this.crypto.sha256Hex(email)}`;
  }
}
