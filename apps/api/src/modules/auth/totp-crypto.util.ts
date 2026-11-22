import { createHmac, randomBytes, randomInt } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BACKUP_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const TOTP_STEP_SEC = 30;
export const TOTP_DIGITS = 6;
export const BACKUP_CODE_COUNT = 8;
export const TOTP_ISSUER = 'PokéVerse OS';
export const TOTP_WINDOW_OFFSETS = [-1, 0, 1] as const;

export function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function decodeBase32(raw: string): Buffer {
  const cleaned = raw.trim().toUpperCase().replaceAll('=', '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error('Invalid Base32 TOTP secret');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(out);
}

export function generateTotpSecretBase32(): string {
  return encodeBase32(randomBytes(20));
}

export function buildTotpOtpauthUri(
  email: string,
  secretBase32: string,
): string {
  const label = encodeURIComponent(`${TOTP_ISSUER}:${email}`);
  const issuer = encodeURIComponent(TOTP_ISSUER);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SEC}`;
}

export function computeTotpAtCounter(
  secretBytes: Buffer,
  counter: number,
): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secretBytes).update(counterBuf).digest();
  const offset = (hmac.at(-1) ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function findMatchingTotpStep(params: {
  readonly secretBase32: string;
  readonly candidateCode: string;
  readonly safeEqualHex: (a: string, b: string) => boolean;
  readonly nowMs?: number;
}): number | null {
  const secretBytes = decodeBase32(params.secretBase32);
  const currentStep = Math.floor(
    (params.nowMs ?? Date.now()) / 1000 / TOTP_STEP_SEC,
  );
  const candidateHex = Buffer.from(params.candidateCode, 'utf8').toString(
    'hex',
  );

  for (const delta of TOTP_WINDOW_OFFSETS) {
    const step = currentStep + delta;
    const expected = computeTotpAtCounter(secretBytes, step);
    const expectedHex = Buffer.from(expected, 'utf8').toString('hex');
    if (params.safeEqualHex(candidateHex, expectedHex)) {
      return step;
    }
  }

  return null;
}

export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i += 1) {
    let chunk = '';
    for (let c = 0; c < 8; c += 1) {
      chunk += BACKUP_CODE_ALPHABET[randomInt(0, BACKUP_CODE_ALPHABET.length)];
    }
    codes.push(`${chunk.slice(0, 4)}-${chunk.slice(4)}`);
  }
  return codes;
}

export function normalizeBackupCode(rawCode: string): string {
  return rawCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}
