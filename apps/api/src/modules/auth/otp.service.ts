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

@Injectable()
export class OtpService {
  constructor(
    private readonly redis: RedisService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<ApiEnvConfig, true>,
  ) {}

  async issueOtp(
    purpose: OtpPurpose,
    normalizedEmail: string,
  ): Promise<{ readonly code: string; readonly expiresInSec: number }> {
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

    await this.redis.setJsonEx(
      this.redisKey(purpose, normalizedEmail),
      ttlSec,
      record,
    );

    return { code, expiresInSec: ttlSec };
  }

  async verifyAndConsumeOtp(
    purpose: OtpPurpose,
    normalizedEmail: string,
    candidateCode: string,
  ): Promise<boolean> {
    const key = this.redisKey(purpose, normalizedEmail);
    const maxAttempts = this.config.get('OTP_MAX_ATTEMPTS', { infer: true });
    const record = await this.redis.getJson<StoredOtpRecord>(key);

    if (!record || Date.now() > record.expiresAtMs) {
      await this.redis.delKeys(key);
      return false;
    }

    if (record.attempts >= maxAttempts) {
      await this.redis.delKeys(key);
      return false;
    }

    const expectedHash = this.crypto.hmacSha256Hex(
      this.hmacContext(purpose, normalizedEmail),
      candidateCode,
    );

    if (this.crypto.safeEqualHex(record.codeHash, expectedHash)) {
      await this.redis.delKeys(key);
      return true;
    }

    const nextAttempts = record.attempts + 1;
    if (nextAttempts >= maxAttempts) {
      await this.redis.delKeys(key);
      return false;
    }

    const remainingSec = Math.max(
      1,
      Math.ceil((record.expiresAtMs - Date.now()) / 1000),
    );
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
}
