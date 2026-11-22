import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from '../../common/security/crypto.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import type { PrismaService } from '../../infra/prisma.service';
import type { RedisService } from '../../infra/redis.service';
import { PasskeyService } from './passkey.service';
import { SessionService } from './session.service';

function createConfigMock(): ConfigService<ApiEnvConfig, true> {
  return {
    get: jest.fn((key: keyof ApiEnvConfig) => {
      switch (key) {
        case 'APP_ENCRYPTION_KEY':
          return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        case 'WEBAUTHN_RP_NAME':
          return 'PokéVerse OS';
        case 'WEBAUTHN_RP_ID':
          return 'localhost';
        case 'WEBAUTHN_ORIGIN':
          return 'http://localhost:4200';
        case 'CORS_ORIGINS':
          return 'http://localhost:4200,http://127.0.0.1:4200';
        case 'SESSION_TTL_SEC':
          return 900;
        case 'REFRESH_TTL_DAYS':
          return 7;
        default:
          return '';
      }
    }),
  } as unknown as ConfigService<ApiEnvConfig, true>;
}

describe('PasskeyService (WebAuthn FIDO2 registration & login assertions)', () => {
  const trainerId = '550e8400-e29b-41d4-a716-446655440000';

  it('lists trainer passkeys and throws NotFoundException when deleting an absent passkey', async () => {
    const passkeyId = '550e8400-e29b-41d4-a716-446655440055';
    const createdAt = new Date('2026-11-20T09:00:00.000Z');
    const deleteMany = jest.fn();

    const prismaMock = {
      trainerPasskey: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: passkeyId,
            label: 'Windows Hello',
            deviceType: 'multiDevice',
            backedUp: true,
            createdAt,
            lastUsedAt: null,
          },
        ]),
        deleteMany,
      },
    } as unknown as PrismaService;

    const configMock = createConfigMock();
    const crypto = new CryptoService(configMock);
    const redisMock = {} as unknown as RedisService;
    const service = new PasskeyService(
      prismaMock,
      redisMock,
      crypto,
      new SessionService(redisMock, crypto, configMock),
      configMock,
    );

    const list = await service.listPasskeys(trainerId);
    expect(list).toEqual([
      {
        id: passkeyId,
        label: 'Windows Hello',
        deviceType: 'multiDevice',
        backedUp: true,
        createdAt: '2026-11-20T09:00:00.000Z',
        lastUsedAt: null,
      },
    ]);

    deleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(
      service.deletePasskey(trainerId, passkeyId),
    ).resolves.toBeUndefined();

    deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.deletePasskey(trainerId, passkeyId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('generates registration options storing challenge in Redis and rejects expired login challenges', async () => {
    const redisStore = new Map<string, string>();
    const setStringEx = jest.fn((key: string, _ttl: number, value: string) => {
      redisStore.set(key, value);
      return Promise.resolve();
    });
    const delKeys = jest.fn((...keys: string[]) => {
      for (const k of keys) {
        redisStore.delete(k);
      }
      return Promise.resolve();
    });

    const redisMock = {
      setStringEx,
      getJson: jest.fn().mockResolvedValue(null),
      delKeys,
    } as unknown as RedisService;

    const prismaMock = {
      trainer: {
        findUnique: jest.fn().mockResolvedValue({
          id: trainerId,
          username: 'Red_Kanto',
          email: 'red@pokeverse.dev',
          passkeys: [],
        }),
      },
    } as unknown as PrismaService;

    const configMock = createConfigMock();
    const crypto = new CryptoService(configMock);
    const service = new PasskeyService(
      prismaMock,
      redisMock,
      crypto,
      new SessionService(redisMock, crypto, configMock),
      configMock,
    );

    const options = await service.generateRegisterOptions(trainerId);
    expect(options.rp.id).toBe('localhost');
    expect(options.challenge).toBeTruthy();
    expect(setStringEx).toHaveBeenCalledWith(
      `webauthn_reg:${trainerId}`,
      120,
      options.challenge,
    );

    await expect(
      service.verifyLoginAssertion({
        challengeToken: 'expired-or-missing-token-1234',
        response: { id: 'cred-1' },
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(delKeys).toHaveBeenCalledWith(
      'webauthn_auth:expired-or-missing-token-1234',
    );
  });
});
