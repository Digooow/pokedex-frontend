import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

    // 4th attempt using the real code MUST fail because 3 failed attempts invalidated the OTP
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
    // Replay of already-consumed OTP must fail
    expect(
      await otpService.verifyAndConsumeOtp(
        'verify',
        'ash@example.com',
        fresh.code,
      ),
    ).toBe(false);
  });
});
