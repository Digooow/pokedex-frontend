import { OutboxStatus, Prisma } from '@prisma/client';
import { createDeepPrismaMock } from '../../testing/prisma-mock.helper';
import type { AuthOutboxCreateInput } from './auth-outbox-publisher.service';
import { MAX_OAUTH_ACCOUNTS_PER_TRAINER } from './trainer-account.repository';
import { TrainerOAuthRepository } from './trainer-oauth.repository';

describe('TrainerOAuthRepository (jest-mock-extended)', () => {
  const trainerId = '550e8400-e29b-41d4-a716-446655440000';

  it('queries linked Google accounts, creates links, and deletes Google links cleanly', async () => {
    const prisma = createDeepPrismaMock();
    prisma.trainerOAuthAccount.findUnique.mockResolvedValueOnce({
      trainer: { id: trainerId, username: 'Red_Kanto' },
    } as never);
    prisma.trainerOAuthAccount.findUnique.mockResolvedValueOnce({
      trainerId,
    } as never);
    prisma.trainerOAuthAccount.create.mockResolvedValue({} as never);
    prisma.trainerOAuthAccount.deleteMany.mockResolvedValue({ count: 1 });

    const repo = new TrainerOAuthRepository(prisma);

    expect(await repo.findTrainerByGoogleAccountId('sub-1')).toMatchObject({
      id: trainerId,
    });
    expect(await repo.findOwnerByGoogleAccountId('sub-1')).toEqual({
      trainerId,
    });

    await repo.createGoogleLink({
      trainerId,
      providerAccountId: 'sub-1',
      email: 'red@pokeverse.dev',
    });
    expect(prisma.trainerOAuthAccount.create).toHaveBeenCalledWith({
      data: {
        trainerId,
        provider: 'google',
        providerAccountId: 'sub-1',
        email: 'red@pokeverse.dev',
      },
    });

    await repo.deleteGoogleLinks(trainerId);
    expect(prisma.trainerOAuthAccount.deleteMany).toHaveBeenCalledWith({
      where: { trainerId, provider: 'google' },
    });
  });

  it('creates Google trainer with OutboxEvent, maps P2002 to conflict, and applies explicit take on unlink lookup', async () => {
    const prisma = createDeepPrismaMock();
    prisma.$transaction.mockImplementation((fn) =>
      (fn as (tx: typeof prisma) => Promise<unknown>)(prisma),
    );
    const createdRow = {
      id: trainerId,
      username: 'Red_Kanto',
      email: 'red@pokeverse.dev',
      emailVerifiedAt: new Date(),
      mfaEnabled: false,
      badgesCount: 0,
      eloRating: 1000,
      lastMapId: 'pokeverse-town',
      lastX: 400,
      lastY: 320,
      createdAt: new Date(),
    };
    prisma.trainer.create.mockResolvedValueOnce(createdRow as never);
    prisma.trainerOAuthAccount.create.mockResolvedValue({} as never);
    prisma.outboxEvent.create.mockResolvedValue({} as never);

    const repo = new TrainerOAuthRepository(prisma);
    const outboxEvent: AuthOutboxCreateInput = {
      id: 'evt-oauth',
      aggregateType: 'Trainer',
      aggregateId: trainerId,
      eventType: 'pokeverse.world.events.v1',
      payload: { eventType: 'trainer.registered' },
      status: OutboxStatus.PENDING,
    };

    const created = await repo.createGoogleTrainerWithOutbox({
      trainerId,
      username: 'Red_Kanto',
      providerAccountId: 'sub-1',
      email: 'red@pokeverse.dev',
      outboxEvent,
    });
    expect(created).toEqual({ status: 'created', trainer: createdRow });

    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );
    expect(
      await repo.createGoogleTrainerWithOutbox({
        trainerId,
        username: 'Red_Kanto',
        providerAccountId: 'sub-1',
        email: 'red@pokeverse.dev',
        outboxEvent,
      }),
    ).toEqual({ status: 'conflict' });

    prisma.$transaction.mockRejectedValueOnce(new Error('DB connection lost'));
    await expect(
      repo.createGoogleTrainerWithOutbox({
        trainerId,
        username: 'Red_Kanto',
        providerAccountId: 'sub-1',
        email: 'red@pokeverse.dev',
        outboxEvent,
      }),
    ).rejects.toThrow('DB connection lost');

    prisma.trainer.findUnique.mockResolvedValueOnce(null);
    await repo.findUnlinkCandidates(trainerId);
    expect(prisma.trainer.findUnique).toHaveBeenCalledWith({
      where: { id: trainerId },
      select: {
        passwordHash: true,
        passkeys: { select: { id: true }, take: 1 },
        oauthAccounts: {
          select: { id: true, provider: true },
          take: MAX_OAUTH_ACCOUNTS_PER_TRAINER,
        },
      },
    });
  });
});
