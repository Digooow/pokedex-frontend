import { TOTAL_POKEDEX_SLOTS } from '@pokeverse/shared';
import { OutboxStatus, Prisma } from '@prisma/client';
import type { PrismaService } from '../../infra/prisma.service';
import type { AuthOutboxCreateInput } from './auth-outbox-publisher.service';
import {
  MAX_OAUTH_ACCOUNTS_PER_TRAINER,
  MAX_PASSKEYS_PER_TRAINER,
  TrainerAccountRepository,
} from './trainer-account.repository';

describe('TrainerAccountRepository (Prisma isolation, P2002/P2025, OutboxStatus & take limits)', () => {
  const trainerId = '550e8400-e29b-41d4-a716-446655440000';
  const worldOutboxEvent: AuthOutboxCreateInput = {
    id: '550e8400-e29b-41d4-a716-446655440010',
    aggregateType: 'Trainer',
    aggregateId: trainerId,
    eventType: 'pokeverse.world.events.v1',
    payload: { eventId: '550e8400-e29b-41d4-a716-446655440010' },
    status: OutboxStatus.PENDING,
  };
  const emailOutboxEvent: AuthOutboxCreateInput = {
    id: '550e8400-e29b-41d4-a716-446655440011',
    aggregateType: 'EmailNotification',
    aggregateId: trainerId,
    eventType: 'pokeverse.notifications.email.v1',
    payload: { version: 1, ciphertext: 'enc' },
    status: OutboxStatus.PENDING,
  };

  it('registers trainer with refresh token and OutboxStatus.PENDING events, returning conflict on P2002', async () => {
    const now = new Date('2026-11-22T10:00:00.000Z');
    const createdTrainer = {
      id: trainerId,
      username: 'Red_Kanto',
      email: 'red@example.com',
      emailVerifiedAt: null,
      mfaEnabled: false,
      passwordHash: 'argon2-hash',
      badgesCount: 0,
      eloRating: 1000,
      lastMapId: 'pokeverse-town',
      lastX: 400,
      lastY: 320,
      createdAt: now,
    };

    const trainerCreate = jest.fn().mockResolvedValue(createdTrainer);
    const refreshCreate = jest.fn().mockResolvedValue({ id: 'rt-1' });
    const outboxCreate = jest.fn().mockResolvedValue({ id: 'ev-1' });

    const prismaSuccess = {
      $transaction: jest.fn(
        (
          fn: (tx: {
            trainer: { create: typeof trainerCreate };
            refreshToken: { create: typeof refreshCreate };
            outboxEvent: { create: typeof outboxCreate };
          }) => Promise<typeof createdTrainer>,
        ) =>
          fn({
            trainer: { create: trainerCreate },
            refreshToken: { create: refreshCreate },
            outboxEvent: { create: outboxCreate },
          }),
      ),
    } as unknown as PrismaService;

    const repoSuccess = new TrainerAccountRepository(prismaSuccess);
    const res = await repoSuccess.registerTrainerWithSessionAndOutbox({
      trainerId,
      username: 'Red_Kanto',
      email: 'red@example.com',
      passwordHash: 'argon2-hash',
      refreshToken: {
        tokenHash: 'hash-1',
        familyId: 'fam-1',
        expiresAt: new Date(now.getTime() + 86_400_000),
      },
      worldOutboxEvent,
      emailOutboxEvent,
    });

    expect(res).toEqual({ status: 'created', trainer: createdTrainer });
    expect(outboxCreate).toHaveBeenCalledTimes(2);
    expect(outboxCreate).toHaveBeenNthCalledWith(1, { data: worldOutboxEvent });
    expect(outboxCreate).toHaveBeenNthCalledWith(2, { data: emailOutboxEvent });

    const prismaConflict = {
      $transaction: jest.fn(() =>
        Promise.reject(
          new Prisma.PrismaClientKnownRequestError('Unique violation', {
            code: 'P2002',
            clientVersion: '6.19.3',
          }),
        ),
      ),
    } as unknown as PrismaService;

    const repoConflict = new TrainerAccountRepository(prismaConflict);
    const conflictRes = await repoConflict.registerTrainerWithSessionAndOutbox({
      trainerId,
      username: 'Red_Kanto',
      email: 'red@example.com',
      passwordHash: 'argon2-hash',
      refreshToken: {
        tokenHash: 'hash-1',
        familyId: 'fam-1',
        expiresAt: new Date(now.getTime() + 86_400_000),
      },
      worldOutboxEvent,
      emailOutboxEvent,
    });
    expect(conflictRes).toEqual({ status: 'conflict' });
  });

  it('applies explicit take limits on security overview and GDPR export queries', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const prismaMock = {
      trainer: { findUnique },
    } as unknown as PrismaService;

    const repository = new TrainerAccountRepository(prismaMock);

    await repository.findSecurityOverviewById(trainerId);
    expect(findUnique).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: trainerId },
        select: expect.objectContaining({
          oauthAccounts: expect.objectContaining({ take: 1 }) as unknown,
          passkeys: expect.objectContaining({
            take: MAX_PASSKEYS_PER_TRAINER,
          }) as unknown,
        }) as unknown,
      }),
    );

    await repository.findExportSnapshotById(trainerId);
    expect(findUnique).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: trainerId },
        select: expect.objectContaining({
          oauthAccounts: expect.objectContaining({
            take: MAX_OAUTH_ACCOUNTS_PER_TRAINER,
          }) as unknown,
          passkeys: expect.objectContaining({
            take: MAX_PASSKEYS_PER_TRAINER,
          }) as unknown,
          pokedexSlots: expect.objectContaining({
            take: TOTAL_POKEDEX_SLOTS,
          }) as unknown,
        }) as unknown,
      }),
    );
  });

  it('returns true on deleteTrainerById and false when P2025 occurs', async () => {
    const del = jest
      .fn()
      .mockResolvedValueOnce({ id: trainerId })
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '6.19.3',
        }),
      );
    const prismaMock = {
      trainer: { delete: del },
    } as unknown as PrismaService;

    const repository = new TrainerAccountRepository(prismaMock);
    expect(await repository.deleteTrainerById(trainerId)).toBe(true);
    expect(await repository.deleteTrainerById(trainerId)).toBe(false);
  });
});
