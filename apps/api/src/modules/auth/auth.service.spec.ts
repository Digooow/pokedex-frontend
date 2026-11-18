import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../infra/prisma.service';
import { AuthService } from './auth.service';

interface RevokeCallArg {
  readonly where: { readonly familyId: string; readonly revokedAt: null };
  readonly data: { readonly revokedAt: Date };
}

describe('AuthService security behaviors', () => {
  it('revokes entire token family when a revoked refresh token is reused', async () => {
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

    const configMock = {
      get: jest.fn((key: keyof ApiEnvConfig) =>
        key === 'JWT_ACCESS_SECRET'
          ? 'a-very-long-test-secret-of-32-plus-chars'
          : 7,
      ),
    } as unknown as ConfigService<ApiEnvConfig, true>;

    const service = new AuthService(
      prismaMock,
      new JwtService(),
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
    expect(revokeCalls[0]?.data.revokedAt).toBeInstanceOf(Date);
  });
});
