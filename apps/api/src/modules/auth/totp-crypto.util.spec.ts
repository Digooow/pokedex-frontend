import { timingSafeEqual } from 'node:crypto';
import {
  BACKUP_CODE_COUNT,
  buildTotpOtpauthUri,
  computeTotpAtCounter,
  decodeBase32,
  encodeBase32,
  findMatchingTotpStep,
  generateBackupCodes,
  generateTotpSecretBase32,
  normalizeBackupCode,
} from './totp-crypto.util';

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

describe('totp-crypto.util (Base32, RFC 6238 HMAC-SHA1, otpauth & backup codes)', () => {
  it('roundtrips Base32 encoding/decoding and rejects invalid alphabets', () => {
    const raw = Buffer.from('12345678901234567890', 'ascii');
    const encoded = encodeBase32(raw);
    expect(encoded).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(decodeBase32(` ${encoded.toLowerCase()}=== `)).toEqual(raw);

    expect(() => decodeBase32('INVALID1!')).toThrow(
      'Invalid Base32 TOTP secret',
    );
  });

  it('computes RFC 6238 SHA-1 test vectors and matches steps in [-1, 0, +1] window', () => {
    const rfcSecret = Buffer.from('12345678901234567890', 'ascii');
    expect(computeTotpAtCounter(rfcSecret, 1)).toBe('287082');

    const secretBase32 = encodeBase32(rfcSecret);
    const nowMs = 3_000_000;
    const currentStep = Math.floor(nowMs / 1000 / 30);

    for (const offset of [-1, 0, 1] as const) {
      const code = computeTotpAtCounter(rfcSecret, currentStep + offset);
      expect(
        findMatchingTotpStep({
          secretBase32,
          candidateCode: code,
          safeEqualHex,
          nowMs,
        }),
      ).toBe(currentStep + offset);
    }

    const outOfWindowCode = computeTotpAtCounter(rfcSecret, currentStep + 3);
    expect(
      findMatchingTotpStep({
        secretBase32,
        candidateCode: outOfWindowCode,
        safeEqualHex,
        nowMs,
      }),
    ).toBeNull();
  });

  it('generates formatted secrets, otpauth URIs, and normalized backup codes', () => {
    const secret = generateTotpSecretBase32();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);

    const uri = buildTotpOtpauthUri('red@example.com', secret);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain('algorithm=SHA1&digits=6&period=30');

    const codes = generateBackupCodes();
    expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    for (const code of codes) {
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    }

    expect(normalizeBackupCode(' ab12-cd34 ')).toBe('AB12CD34');
  });
});
