import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from '../../common/security/crypto.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import {
  computeTotpAtCounter,
  decodeBase32,
  MfaTotpService,
} from './mfa-totp.service';
import { SessionService } from './session.service';

function createConfigMock(): ConfigService<ApiEnvConfig, true> {
  return {
    get: jest.fn((key: keyof ApiEnvConfig) => {
      switch (key) {
        case 'APP_ENCRYPTION_KEY':
          return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        case 'SESSION_TTL_SEC':
          return 900;
        case 'REFRESH_TTL_DAYS':
          return 7;
        case 'COOKIE_SECURE':
          return false;
        default:
          return '';
      }
    }),
  } as unknown as ConfigService<ApiEnvConfig, true>;
}

describe('MfaTotpService (RFC 6238, AES-256-GCM, 8 backup codes & anti-replay)', () => {
  it('sets up TOTP QR code, encrypts secret with AES-256-GCM, generates 8 backup codes, and enforces TOTP anti-replay + backup single-use', async () => {
    const trainerId = '550e8400-e29b-41d4-a716-446655440000';
    const redisStore = new Map<string, string>();
    const trainerRow = {
      id: trainerId,
      username: 'Red_Kanto',
      email: 'red@example.com',
      emailVerifiedAt: new Date(),
      mfaEnabled: false,
      totpSecretEncrypted: null as string | null,
      passwordHash: 'hash',
      badgesCount: 0,
      eloRating: 1000,
      lastMapId: 'pokeverse-town',
      lastX: 400,
      lastY: 320,
      createdAt: new Date(),
    };
    const backupCodesDb: Array<{
      id: string;
      trainerId: string;
      codeHash: string;
      usedAt: Date | null;
    }> = [];

    const redisMock = {
      getString: jest.fn((key: string) =>
        Promise.resolve(redisStore.get(key) ?? null),
      ),
      setStringEx: jest.fn((key: string, _ttl: number, value: string) => {
        redisStore.set(key, value);
        return Promise.resolve();
      }),
      setStringNxEx: jest.fn((key: string, _ttl: number, value: string) => {
        if (redisStore.has(key)) {
          return Promise.resolve(false);
        }
        redisStore.set(key, value);
        return Promise.resolve(true);
      }),
      delKeys: jest.fn((...keys: string[]) => {
        for (const k of keys) {
          redisStore.delete(k);
        }
        return Promise.resolve();
      }),
      setJsonEx: jest.fn((key: string, _ttl: number, value: unknown) => {
        redisStore.set(key, JSON.stringify(value));
        return Promise.resolve();
      }),
      getJson: jest.fn((key: string) => {
        const raw = redisStore.get(key);
        return Promise.resolve(raw ? (JSON.parse(raw) as unknown) : null);
      }),
      addToSetWithTtl: jest.fn().mockResolvedValue(undefined),
    } as unknown as RedisService;

    const prismaMock = {
      trainer: {
        findUnique: jest.fn(() => Promise.resolve(trainerRow)),
        update: jest.fn(
          (arg: {
            data: { mfaEnabled: boolean; totpSecretEncrypted: string };
          }) => {
            trainerRow.mfaEnabled = arg.data.mfaEnabled;
            trainerRow.totpSecretEncrypted = arg.data.totpSecretEncrypted;
            return Promise.resolve(trainerRow);
          },
        ),
      },
      mfaBackupCode: {
        deleteMany: jest.fn(() => {
          backupCodesDb.length = 0;
          return Promise.resolve({ count: 0 });
        }),
        createMany: jest.fn(
          (arg: { data: Array<{ trainerId: string; codeHash: string }> }) => {
            for (const [idx, item] of arg.data.entries()) {
              backupCodesDb.push({
                id: `bc-${idx}`,
                trainerId: item.trainerId,
                codeHash: item.codeHash,
                usedAt: null,
              });
            }
            return Promise.resolve({ count: arg.data.length });
          },
        ),
        findFirst: jest.fn(
          (arg: { where: { codeHash: string; usedAt: null } }) => {
            const hit = backupCodesDb.find(
              (b) => b.codeHash === arg.where.codeHash && b.usedAt === null,
            );
            return Promise.resolve(hit ?? null);
          },
        ),
        updateMany: jest.fn((arg: { where: { id: string; usedAt: null } }) => {
          const hit = backupCodesDb.find(
            (b) => b.id === arg.where.id && b.usedAt === null,
          );
          if (!hit) {
            return Promise.resolve({ count: 0 });
          }
          hit.usedAt = new Date();
          return Promise.resolve({ count: 1 });
        }),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt-1' }),
      },
      outboxEvent: {
        create: jest.fn().mockResolvedValue({ id: 'ev-1' }),
      },
      $transaction: jest.fn(
        async (fn: (tx: PrismaService) => Promise<unknown>) => fn(prismaMock),
      ),
    } as unknown as PrismaService;

    const configMock = createConfigMock();
    const crypto = new CryptoService(configMock);
    const sessionService = new SessionService(redisMock, crypto, configMock);
    const totpService = new MfaTotpService(
      prismaMock,
      redisMock,
      crypto,
      sessionService,
      configMock,
    );

    const setup = await totpService.initiateSetup(trainerId);
    expect(setup.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(setup.otpauthUri).toContain(setup.secretBase32);

    const currentCounter = Math.floor(Date.now() / 1000 / 30);
    const validTotpCode = computeTotpAtCounter(
      decodeBase32(setup.secretBase32),
      currentCounter,
    );

    const enabled = await totpService.confirmEnable(
      trainerId,
      validTotpCode,
      null,
    );
    expect(enabled.backupCodes).toHaveLength(8);
    expect(trainerRow.mfaEnabled).toBe(true);
    expect(trainerRow.totpSecretEncrypted).toMatch(/^v1:/);
    expect(backupCodesDb).toHaveLength(8);

    // Same TOTP step already used during confirmEnable must be blocked by anti-replay!
    const { rawSid } = await sessionService.createSession({
      trainerId,
      username: 'Red_Kanto',
      familyId: '550e8400-e29b-41d4-a716-446655440099',
      state: 'MFA_PENDING',
      mfaMethods: ['totp', 'backup_code'],
    });

    await expect(
      totpService.verifyChallengeAndPromote(rawSid, trainerId, {
        method: 'totp',
        code: validTotpCode,
      }),
    ).rejects.toThrow(UnauthorizedException);

    // Now use one of the 8 backup codes -> succeeds and promotes session!
    const firstBackup = enabled.backupCodes[0];
    if (!firstBackup) {
      throw new Error('Expected at least one generated backup code');
    }
    const promotedRes = await totpService.verifyChallengeAndPromote(
      rawSid,
      trainerId,
      { method: 'backup_code', code: firstBackup },
    );
    expect(promotedRes.session.sessionState).toBe('AUTHENTICATED');
    expect(promotedRes.refreshToken).toBeTruthy();

    // Replay of same backup code MUST fail!
    await expect(
      totpService.verifyChallengeAndPromote(rawSid, trainerId, {
        method: 'backup_code',
        code: firstBackup,
      }),
    ).rejects.toThrow(UnauthorizedException);

    // Confirm confirmEnable rejects expired/missing pending secret
    await expect(
      totpService.confirmEnable(trainerId, '123456', null),
    ).rejects.toThrow(BadRequestException);
  });
});
