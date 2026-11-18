import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvConfig } from '../../config/env.schema';

const ENVELOPE_PREFIX = 'v1:';

@Injectable()
export class CryptoService {
  private readonly aesKey: Buffer;
  private readonly hmacKey: Buffer;

  constructor(config: ConfigService<ApiEnvConfig, true>) {
    const rawKey = config.get('APP_ENCRYPTION_KEY', { infer: true }).trim();
    const ikm = /^[0-9a-f]{64}$/i.test(rawKey)
      ? Buffer.from(rawKey, 'hex')
      : Buffer.from(rawKey, 'utf8');

    this.aesKey = Buffer.from(
      hkdfSync(
        'sha256',
        ikm,
        'pokeverse-iam-salt-v1',
        'pokeverse:aes-256-gcm:v1',
        32,
      ),
    );
    this.hmacKey = Buffer.from(
      hkdfSync(
        'sha256',
        ikm,
        'pokeverse-iam-salt-v1',
        'pokeverse:hmac-sha256:v1',
        32,
      ),
    );
  }

  encryptString(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.aesKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return `${ENVELOPE_PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  decryptString(token: string): string {
    if (!token.startsWith(ENVELOPE_PREFIX)) {
      throw new Error('Unsupported encrypted envelope version');
    }

    const parts = token.slice(ENVELOPE_PREFIX.length).split('.');
    if (parts.length !== 3) {
      throw new Error('Malformed encrypted envelope');
    }

    const [ivB64, tagB64, ctB64] = parts;
    if (!ivB64 || !tagB64 || !ctB64) {
      throw new Error('Missing encrypted envelope segment');
    }

    const iv = Buffer.from(ivB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    const ciphertext = Buffer.from(ctB64, 'base64url');

    const decipher = createDecipheriv('aes-256-gcm', this.aesKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  encryptJson(payload: unknown): string {
    return this.encryptString(JSON.stringify(payload));
  }

  decryptJson<T>(token: string): T {
    return JSON.parse(this.decryptString(token)) as T;
  }

  hmacSha256Hex(purpose: string, value: string): string {
    return createHmac('sha256', this.hmacKey)
      .update(`${purpose}:${value}`)
      .digest('hex');
  }

  sha256Hex(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  safeEqualHex(leftHex: string, rightHex: string): boolean {
    if (leftHex.length !== rightHex.length) {
      return false;
    }
    const left = Buffer.from(leftHex, 'hex');
    const right = Buffer.from(rightHex, 'hex');
    if (left.length === 0 || left.length !== right.length) {
      return false;
    }
    return timingSafeEqual(left, right);
  }
}
