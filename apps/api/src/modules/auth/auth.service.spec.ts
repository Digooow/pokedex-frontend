import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { CryptoService } from '../../common/security/crypto.service';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';

interface RevokeCallArg {
  readonly where: { readonly familyId: string; readonly revokedAt: null };
  readonly data: { readonly revokedAt: Date };
}

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
        case 'OTP_TTL_SEC':
          return 600;
        case 'OTP_MAX_ATTEMPTS':
          return 3;
        case 'COOKIE_SECURE':
          return false;
        default:
          return '';
      }
    }),
  } as unknown as ConfigService<ApiEnvConfig, true>;
}

describe('AuthService & OtpService enterprise IAM behaviors', () => {
  it('revokes both Postgres token family and active Redis sessions when a revoked refresh token is reused', async () => {
    const revokeCalls: RevokeCallArg[] = [];
    const updateMany = jest.fn((arg: RevokeCallArg) => {
      revokeCalls.push(arg);
      return Promise.resolve({ count: 2 });
    });
    const findUnique = jest.fn().mockResolvedValue({
      id: 'tok-1',
      trainerId: '550e8400-e29b-41d4-a716-446655440000',
      familyId: 'fam-99',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(Date.now() - 5_000),
      trainer: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        username: 'Red_Kanto',
        email: 'red@example.com',
        emailVerifiedAt: null,
        mfaEnabled: false,
        passwordHash: 'hash',
        badgesCount: 0,
        eloRating: 1000,
        lastMapId: 'pokeverse-town',
        lastX: 400,
        lastY: 320,
        createdAt: new Date(),
      },
    });

    const prismaMock = {
      refreshToken: { findUnique, updateMany },
    } as unknown as PrismaService;

    const delKeys = jest.fn().mockResolvedValue(undefined);
    const getSetMembers = jest
      .fn()
      .mockResolvedValue(['sidhash-1', 'sidhash-2']);
    const redisMock = {
      getString: jest.fn().mockResolvedValue(null),
      delKeys,
      getSetMembers,
    } as unknown as RedisService;

    const configMock = createConfigMock();
    const crypto = new CryptoService(configMock);
    const sessionService = new SessionService(redisMock, crypto, configMock);
    const otpService = new OtpService(redisMock, crypto, configMock);

    const service = new AuthService(
      prismaMock,
      redisMock,
      crypto,
      sessionService,
      otpService,
      configMock,
      new StructuredLoggerService(),
    );

    await expect(service.refresh('stolen-token-value')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(revokeCalls).toHaveLength(1);
    expect(revokeCalls[0]?.where).toEqual({
      familyId: 'fam-99',
      revokedAt: null,
    });
    expect(getSetMembers).toHaveBeenCalledWith(
      'trainer_sessions:550e8400-e29b-41d4-a716-446655440000',
    );
    expect(delKeys).toHaveBeenCalledWith(
      'sess:sidhash-1',
      'sess:sidhash-2',
      'trainer_sessions:550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('runs Argon2id timing shield on unknown login email and issues MFA_PENDING without RefreshToken when mfaEnabled=true', async () => {
    const trainerFindUnique = jest.fn().mockResolvedValueOnce(null);
    const refreshCreate = jest.fn();

    const redisStore = new Map<string, string>();
    const setStringEx = jest.fn((key: string, _ttl: number, value: string) => {
      redisStore.set(key, value);
      return Promise.resolve();
    });
    const redisMock = {
      getString: jest.fn((key: string) =>
        Promise.resolve(redisStore.get(key) ?? null),
      ),
      setStringEx,
      delKeys: jest.fn((...keys: string[]) => {
        for (const key of keys) {
          redisStore.delete(key);
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
      trainer: { findUnique: trainerFindUnique },
      refreshToken: { create: refreshCreate },
    } as unknown as PrismaService;

    const configMock = createConfigMock();
    const crypto = new CryptoService(configMock);
    const sessionService = new SessionService(redisMock, crypto, configMock);
    const otpService = new OtpService(redisMock, crypto, configMock);

    const service = new AuthService(
      prismaMock,
      redisMock,
      crypto,
      sessionService,
      otpService,
      configMock,
      new StructuredLoggerService(),
    );

    await service.onModuleInit();

    const startedAt = performance.now();
    await expect(
      service.login(
        { email: 'missing@example.com', password: 'wrong-password' },
        '127.0.0.1',
      ),
    ).rejects.toThrow(UnauthorizedException);
    const elapsedMs = performance.now() - startedAt;
    expect(elapsedMs).toBeGreaterThanOrEqual(5);
    expect(setStringEx).toHaveBeenCalledWith(
      expect.stringMatching(/^login_fail:/),
      300,
      '1',
    );

    const validHash = await argon2.hash('correct-password-123', {
      type: argon2.argon2id,
    });
    trainerFindUnique.mockResolvedValueOnce({
      id: '550e8400-e29b-41d4-a716-446655440000',
      username: 'Red_Kanto',
      email: 'red@example.com',
      emailVerifiedAt: new Date(),
      mfaEnabled: true,
      passwordHash: validHash,
      totpSecretEncrypted: 'v1:encrypted',
      passkeys: [],
      badgesCount: 0,
      eloRating: 1000,
      lastMapId: 'pokeverse-town',
      lastX: 400,
      lastY: 320,
      createdAt: new Date(),
    });

    const outcome = await service.login(
      { email: 'red@example.com', password: 'correct-password-123' },
      '127.0.0.1',
    );
    expect(outcome.session.sessionState).toBe('MFA_PENDING');
    expect(outcome.session.mfaMethods).toEqual(['totp', 'backup_code']);
    expect(outcome.refreshToken).toBeNull();
    expect(refreshCreate).not.toHaveBeenCalled();
  });

  it('invalidates a 6-digit OTP after 3 failed attempts and enforces single-use consumption', async () => {
    const redisStore = new Map<string, string>();
    const redisMock = {
      setJsonEx: jest.fn((key: string, _ttl: number, value: unknown) => {
        redisStore.set(key, JSON.stringify(value));
        return Promise.resolve();
      }),
      getJson: jest.fn((key: string) => {
        const raw = redisStore.get(key);
        return Promise.resolve(raw ? (JSON.parse(raw) as unknown) : null);
      }),
      delKeys: jest.fn((...keys: string[]) => {
        for (const key of keys) {
          redisStore.delete(key);
        }
        return Promise.resolve();
      }),
    } as unknown as RedisService;

    const configMock = createConfigMock();
    const crypto = new CryptoService(configMock);
    const otpService = new OtpService(redisMock, crypto, configMock);

    const { code } = await otpService.issueOtp('reset', 'ash@example.com');
    const wrongCode = code === '000000' ? '111111' : '000000';

    expect(
      await otpService.verifyAndConsumeOtp(
        'reset',
        'ash@example.com',
        wrongCode,
      ),
    ).toBe(false);
    expect(
      await otpService.verifyAndConsumeOtp(
        'reset',
        'ash@example.com',
        wrongCode,
      ),
    ).toBe(false);
    expect(
      await otpService.verifyAndConsumeOtp(
        'reset',
        'ash@example.com',
        wrongCode,
      ),
    ).toBe(false);

    expect(
      await otpService.verifyAndConsumeOtp('reset', 'ash@example.com', code),
    ).toBe(false);

    const fresh = await otpService.issueOtp('verify', 'ash@example.com');
    expect(
      await otpService.verifyAndConsumeOtp(
        'verify',
        'ash@example.com',
        fresh.code,
      ),
    ).toBe(true);

    expect(
      await otpService.verifyAndConsumeOtp(
        'verify',
        'ash@example.com',
        fresh.code,
      ),
    ).toBe(false);
  });

  it('serves concurrent multi-tab refresh within the 10s grace window without revoking the token family', async () => {
    const trainerId = '550e8400-e29b-41d4-a716-446655440000';
    const familyId = '550e8400-e29b-41d4-a716-446655440099';
    const trainerRow = {
      id: trainerId,
      username: 'Red_Kanto',
      email: 'red@example.com',
      emailVerifiedAt: new Date(),
      mfaEnabled: false,
      passwordHash: 'hash',
      badgesCount: 0,
      eloRating: 1000,
      lastMapId: 'pokeverse-town',
      lastX: 400,
      lastY: 320,
      createdAt: new Date(),
    };

    const redisStore = new Map<string, string>();
    const redisMock = {
      getString: jest.fn((key: string) =>
        Promise.resolve(redisStore.get(key) ?? null),
      ),
      setStringEx: jest.fn((key: string, _ttl: number, value: string) => {
        redisStore.set(key, value);
        return Promise.resolve();
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
      getSetMembers: jest.fn().mockResolvedValue([]),
      removeSetMembers: jest.fn().mockResolvedValue(undefined),
    } as unknown as RedisService;

    let revokedAt: Date | null = null;
    const findUnique = jest.fn(() =>
      Promise.resolve({
        id: 'tok-1',
        trainerId,
        familyId,
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt,
        trainer: trainerRow,
      }),
    );

    const prismaMock = {
      refreshToken: {
        findUnique,
        updateMany: jest.fn(() => {
          revokedAt = new Date();
          return Promise.resolve({ count: 1 });
        }),
      },
      $transaction: jest.fn(
        async (
          fn: (tx: {
            refreshToken: {
              updateMany: () => Promise<{ count: number }>;
              create: () => Promise<void>;
            };
          }) => Promise<boolean>,
        ) =>
          fn({
            refreshToken: {
              updateMany: () => {
                revokedAt = new Date();
                return Promise.resolve({ count: 1 });
              },
              create: () => Promise.resolve(),
            },
          }),
      ),
    } as unknown as PrismaService;

    const configMock = createConfigMock();
    const crypto = new CryptoService(configMock);
    const sessionService = new SessionService(redisMock, crypto, configMock);
    const otpService = new OtpService(redisMock, crypto, configMock);
    const service = new AuthService(
      prismaMock,
      redisMock,
      crypto,
      sessionService,
      otpService,
      configMock,
      new StructuredLoggerService(),
    );

    const first = await service.refresh('tab-1-refresh-token-value');
    expect(first.refreshToken).toBeTruthy();

    const concurrent = await service.refresh('tab-1-refresh-token-value');
    expect(concurrent.refreshToken).toBe(first.refreshToken);
    expect(concurrent.sessionSid).toBe(first.sessionSid);
    expect(concurrent.session.trainer.username).toBe('Red_Kanto');
  });

  it('uses __Host- for root session cookie and __Secure- for path-scoped cookies in HTTPS, and manages active sessions + LGPD export', async () => {
    const prodConfig = {
      get: jest.fn((key: keyof ApiEnvConfig) => {
        switch (key) {
          case 'APP_ENCRYPTION_KEY':
            return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
          case 'COOKIE_SECURE':
            return true;
          case 'COOKIE_SAMESITE':
            return 'lax';
          case 'COOKIE_DOMAIN':
            return '';
          case 'SESSION_TTL_SEC':
            return 900;
          case 'REFRESH_TTL_DAYS':
            return 7;
          default:
            return '';
        }
      }),
    } as unknown as ConfigService<ApiEnvConfig, true>;

    const trainerId = '550e8400-e29b-41d4-a716-446655440000';
    const currentFamilyId = '550e8400-e29b-41d4-a716-446655440001';
    const otherFamilyId = '550e8400-e29b-41d4-a716-446655440002';

    const redisStore = new Map<string, string>();
    const setMembers = new Set<string>(['sid-current', 'sid-other']);
    redisStore.set(
      'sess:sid-current',
      JSON.stringify({
        sidHash: 'sid-current',
        trainerId,
        username: 'Red_Kanto',
        familyId: currentFamilyId,
        state: 'AUTHENTICATED',
        mfaMethods: [],
        createdAt: new Date().toISOString(),
      }),
    );
    redisStore.set(
      'sess:sid-other',
      JSON.stringify({
        sidHash: 'sid-other',
        trainerId,
        username: 'Red_Kanto',
        familyId: otherFamilyId,
        state: 'AUTHENTICATED',
        mfaMethods: [],
        createdAt: new Date().toISOString(),
      }),
    );

    const redisMock = {
      getSetMembers: jest.fn().mockResolvedValue(Array.from(setMembers)),
      getJson: jest.fn((key: string) => {
        const raw = redisStore.get(key);
        return Promise.resolve(raw ? (JSON.parse(raw) as unknown) : null);
      }),
      delKeys: jest.fn((...keys: string[]) => {
        for (const k of keys) {
          redisStore.delete(k);
        }
        return Promise.resolve();
      }),
      removeSetMembers: jest.fn((_key: string, ...members: string[]) => {
        for (const m of members) {
          setMembers.delete(m);
        }
        return Promise.resolve();
      }),
    } as unknown as RedisService;

    const crypto = new CryptoService(prodConfig);
    const sessionService = new SessionService(redisMock, crypto, prodConfig);
    expect(sessionService.getCookieNames()).toMatchObject({
      sessionCookieName: '__Host-pokeverse_session',
      refreshCookieName: '__Secure-pokeverse_refresh',
      oauthBindCookieName: '__Secure-pokeverse_oauth_bind',
      secure: true,
    });

    const prismaMock = {
      refreshToken: {
        findMany: jest.fn().mockResolvedValue([
          {
            familyId: currentFamilyId,
            createdAt: new Date('2026-11-20T10:00:00.000Z'),
            expiresAt: new Date('2026-11-27T10:00:00.000Z'),
          },
          {
            familyId: otherFamilyId,
            createdAt: new Date('2026-11-19T10:00:00.000Z'),
            expiresAt: new Date('2026-11-26T10:00:00.000Z'),
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      trainer: {
        findUnique: jest.fn().mockResolvedValue({
          id: trainerId,
          username: 'Red_Kanto',
          email: 'red@example.com',
          emailVerifiedAt: null,
          mfaEnabled: false,
          passwordHash: 'argon2-secret-never-exported',
          badgesCount: 2,
          eloRating: 1120,
          lastMapId: 'pokeverse-town',
          lastX: 400,
          lastY: 320,
          createdAt: new Date('2026-11-18T10:00:00.000Z'),
          oauthAccounts: [],
          passkeys: [],
          pokedexSlots: [
            {
              slotIndex: 0,
              pokemonId: 25,
              pokemonName: 'pikachu',
              nickname: 'Sparky',
              spriteUrl: null,
              updatedAt: new Date('2026-11-20T10:00:00.000Z'),
            },
          ],
        }),
      },
    } as unknown as PrismaService;

    const service = new AuthService(
      prismaMock,
      redisMock,
      crypto,
      sessionService,
      new OtpService(redisMock, crypto, prodConfig),
      prodConfig,
      new StructuredLoggerService(),
    );

    const active = await service.listActiveSessions(trainerId, currentFamilyId);
    expect(active.sessions).toHaveLength(2);
    expect(active.sessions[0]?.isCurrent).toBe(true);
    expect(active.sessions[1]?.isCurrent).toBe(false);

    const revoked = await service.revokeOtherSessions(
      trainerId,
      currentFamilyId,
    );
    expect(revoked.revokedCount).toBe(1);
    expect(redisStore.has('sess:sid-other')).toBe(false);
    expect(redisStore.has('sess:sid-current')).toBe(true);

    const exported = await service.exportTrainerData(trainerId);
    expect(exported.trainer.username).toBe('Red_Kanto');
    expect(exported.pokedexSlots).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toContain(
      'argon2-secret-never-exported',
    );
  });

  it('does not overwrite or delete an existing verification OTP when register() fails with P2002', async () => {
    const redisStore = new Map<string, string>();
    const setJsonEx = jest.fn((key: string, _ttl: number, value: unknown) => {
      redisStore.set(key, JSON.stringify(value));
      return Promise.resolve();
    });
    const delKeys = jest.fn((...keys: string[]) => {
      for (const k of keys) {
        redisStore.delete(k);
      }
      return Promise.resolve();
    });

    const redisMock = {
      getString: jest.fn((key: string) =>
        Promise.resolve(redisStore.get(key) ?? null),
      ),
      setStringEx: jest.fn((key: string, _ttl: number, value: string) => {
        redisStore.set(key, value);
        return Promise.resolve();
      }),
      incrementCounterWithTtl: jest.fn((key: string) => {
        const next = Number(redisStore.get(key) ?? '0') + 1;
        redisStore.set(key, String(next));
        return Promise.resolve(next);
      }),
      setJsonEx,
      getJson: jest.fn((key: string) => {
        const raw = redisStore.get(key);
        return Promise.resolve(raw ? (JSON.parse(raw) as unknown) : null);
      }),
      delKeys,
    } as unknown as RedisService;

    const prismaMock = {
      $transaction: jest.fn(() =>
        Promise.reject(
          new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed on email',
            { code: 'P2002', clientVersion: '6.19.3' },
          ),
        ),
      ),
    } as unknown as PrismaService;

    const configMock = createConfigMock();
    const crypto = new CryptoService(configMock);
    const sessionService = new SessionService(redisMock, crypto, configMock);
    const otpService = new OtpService(redisMock, crypto, configMock);
    const service = new AuthService(
      prismaMock,
      redisMock,
      crypto,
      sessionService,
      otpService,
      configMock,
      new StructuredLoggerService(),
    );

    const existingOtp = await otpService.issueOtp(
      'verify',
      'pending@example.com',
    );
    setJsonEx.mockClear();
    delKeys.mockClear();

    await expect(
      service.register(
        {
          username: 'Ash_Kanto',
          email: 'pending@example.com',
          password: 'Password1234!',
        },
        null,
      ),
    ).rejects.toThrow(ConflictException);

    expect(setJsonEx).not.toHaveBeenCalled();
    expect(delKeys).not.toHaveBeenCalled();
    expect(
      await otpService.verifyAndConsumeOtp(
        'verify',
        'pending@example.com',
        existingOtp.code,
      ),
    ).toBe(true);
  });

  it('blocks OTP verification after 3 concurrent failed attempts using atomic Redis counter', async () => {
    const redisStore = new Map<string, string>();
    const incrementCounterWithTtl = jest.fn((key: string) => {
      const next = Number(redisStore.get(key) ?? '0') + 1;
      redisStore.set(key, String(next));
      return Promise.resolve(next);
    });
    const delKeys = jest.fn((...keys: string[]) => {
      for (const k of keys) {
        redisStore.delete(k);
      }
      return Promise.resolve();
    });
    const redisMock = {
      getString: jest.fn((key: string) =>
        Promise.resolve(redisStore.get(key) ?? null),
      ),
      setJsonEx: jest.fn((key: string, _ttl: number, value: unknown) => {
        redisStore.set(key, JSON.stringify(value));
        return Promise.resolve();
      }),
      getJson: jest.fn((key: string) => {
        const raw = redisStore.get(key);
        return Promise.resolve(raw ? (JSON.parse(raw) as unknown) : null);
      }),
      incrementCounterWithTtl,
      delKeys,
    } as unknown as RedisService;

    const configMock = createConfigMock();
    const crypto = new CryptoService(configMock);
    const otpService = new OtpService(redisMock, crypto, configMock);

    const issued = await otpService.issueOtp('verify', 'race@example.com');
    const wrongCode = issued.code === '000000' ? '111111' : '000000';

    const concurrentResults = await Promise.all([
      otpService.verifyAndConsumeOtp('verify', 'race@example.com', wrongCode),
      otpService.verifyAndConsumeOtp('verify', 'race@example.com', wrongCode),
      otpService.verifyAndConsumeOtp('verify', 'race@example.com', wrongCode),
    ]);

    expect(concurrentResults).toEqual([false, false, false]);
    expect(incrementCounterWithTtl).toHaveBeenCalledTimes(3);
    expect(delKeys).toHaveBeenCalled();
    expect(
      await otpService.verifyAndConsumeOtp(
        'verify',
        'race@example.com',
        issued.code,
      ),
    ).toBe(false);
  });
});
