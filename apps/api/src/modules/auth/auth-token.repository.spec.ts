import { OutboxStatus } from '@prisma/client';
import type { PrismaService } from '../../infra/prisma.service';
import {
  AuthTokenRepository,
  MAX_ACTIVE_SESSION_FAMILIES,
} from './auth-token.repository';

describe('AuthTokenRepository (distinct familyId, rotation & OutboxStatus.PUBLISHED purge)', () => {
  const trainerId = '550e8400-e29b-41d4-a716-446655440000';

  it('lists active session families using distinct familyId and explicit take', async () => {
    const now = new Date('2026-11-22T12:00:00.000Z');
    const rows = [
      {
        familyId: '550e8400-e29b-41d4-a716-446655440001',
        createdAt: new Date('2026-11-22T10:00:00.000Z'),
        expiresAt: new Date('2026-11-29T10:00:00.000Z'),
      },
    ];
    const findMany = jest.fn().mockResolvedValue(rows);
    const prismaMock = {
      refreshToken: { findMany },
    } as unknown as PrismaService;

    const repository = new AuthTokenRepository(prismaMock);
    const result = await repository.listActiveSessionFamilies(trainerId, now);

    expect(result).toEqual(rows);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        trainerId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      distinct: ['familyId'],
      orderBy: { createdAt: 'desc' },
      take: MAX_ACTIVE_SESSION_FAMILIES,
      select: {
        familyId: true,
        createdAt: true,
        expiresAt: true,
      },
    });
  });

  it('rotates refresh token atomically and aborts when concurrent revoke already consumed row', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const create = jest.fn().mockResolvedValue({ id: 'rt-2' });

    const prismaMock = {
      $transaction: jest.fn(
        (
          fn: (tx: {
            refreshToken: {
              updateMany: typeof updateMany;
              create: typeof create;
            };
          }) => Promise<boolean>,
        ) => fn({ refreshToken: { updateMany, create } }),
      ),
    } as unknown as PrismaService;

    const repository = new AuthTokenRepository(prismaMock);
    const nextExpiry = new Date('2026-11-29T12:00:00.000Z');

    expect(
      await repository.rotateRefreshToken({
        existingId: 'rt-1',
        trainerId,
        familyId: 'fam-1',
        nextTokenHash: 'next-hash',
        nextExpiresAt: nextExpiry,
      }),
    ).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);

    expect(
      await repository.rotateRefreshToken({
        existingId: 'rt-1',
        trainerId,
        familyId: 'fam-1',
        nextTokenHash: 'next-hash-2',
        nextExpiresAt: nextExpiry,
      }),
    ).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('purges expired refresh tokens and OutboxStatus.PUBLISHED rows', async () => {
    const cutoff = new Date('2026-11-15T00:00:00.000Z');
    const refreshDeleteMany = jest.fn().mockResolvedValue({ count: 3 });
    const outboxDeleteMany = jest.fn().mockResolvedValue({ count: 5 });

    const prismaMock = {
      refreshToken: { deleteMany: refreshDeleteMany },
      outboxEvent: { deleteMany: outboxDeleteMany },
    } as unknown as PrismaService;

    const repository = new AuthTokenRepository(prismaMock);
    const res = await repository.purgeExpiredTokensAndPublishedOutbox(cutoff);

    expect(res).toEqual({ deletedRefreshTokens: 3, deletedOutboxEvents: 5 });
    expect(outboxDeleteMany).toHaveBeenCalledWith({
      where: {
        status: OutboxStatus.PUBLISHED,
        createdAt: { lt: cutoff },
      },
    });
  });
});
