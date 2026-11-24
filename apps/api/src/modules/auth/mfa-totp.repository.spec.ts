import { OutboxStatus } from '@prisma/client';
import { createDeepPrismaMock } from '../../testing/prisma-mock.helper';
import type { AuthOutboxCreateInput } from './auth-outbox-publisher.service';
import { MfaTotpRepository } from './mfa-totp.repository';

describe('MfaTotpRepository (jest-mock-extended)', () => {
  const trainerId = '550e8400-e29b-41d4-a716-446655440000';

  it('loads TOTP state, contact, challenge, and disable projections via strict select', async () => {
    const prisma = createDeepPrismaMock();
    prisma.trainer.findUnique.mockResolvedValueOnce({
      email: 'red@pokeverse.dev',
      mfaEnabled: true,
      totpSecretEncrypted: 'v1:secret',
    } as never);
    prisma.trainer.findUnique.mockResolvedValueOnce({
      email: 'red@pokeverse.dev',
      username: 'Red_Kanto',
    } as never);
    prisma.trainer.findUnique.mockResolvedValueOnce(null);
    prisma.trainer.findUnique.mockResolvedValueOnce(null);

    const repo = new MfaTotpRepository(prisma);
    expect(await repo.findTotpSetupState(trainerId)).toMatchObject({
      mfaEnabled: true,
    });
    expect(await repo.findTrainerContact(trainerId)).toEqual({
      email: 'red@pokeverse.dev',
      username: 'Red_Kanto',
    });
    expect(await repo.findForMfaChallenge(trainerId)).toBeNull();
    expect(await repo.findForTotpDisable(trainerId)).toBeNull();
    expect(prisma.trainer.findUnique).toHaveBeenCalledTimes(4);
  });

  it('enables and disables TOTP atomically with backup codes and OutboxEvent', async () => {
    const prisma = createDeepPrismaMock();
    prisma.$transaction.mockImplementation((fn) =>
      (fn as (tx: typeof prisma) => Promise<unknown>)(prisma),
    );
    prisma.trainer.update.mockResolvedValue({} as never);
    prisma.mfaBackupCode.deleteMany.mockResolvedValue({ count: 8 });
    prisma.mfaBackupCode.createMany.mockResolvedValue({ count: 8 });
    prisma.outboxEvent.create.mockResolvedValue({} as never);

    const repo = new MfaTotpRepository(prisma);
    const outboxEvent: AuthOutboxCreateInput = {
      id: 'evt-1',
      aggregateType: 'Trainer',
      aggregateId: trainerId,
      eventType: 'pokeverse.notifications.email.v1',
      payload: { template: 'security_alert' },
      status: OutboxStatus.PENDING,
    };

    await repo.enableTotpWithBackupCodesAndOutbox({
      trainerId,
      secretEncrypted: 'v1:enc',
      codeHashes: ['h1', 'h2'],
      outboxEvent,
    });

    expect(prisma.mfaBackupCode.createMany).toHaveBeenCalledWith({
      data: [
        { trainerId, codeHash: 'h1' },
        { trainerId, codeHash: 'h2' },
      ],
    });
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
      data: outboxEvent,
    });

    await repo.disableTotpAndOutbox({ trainerId, outboxEvent });
    expect(prisma.trainer.update).toHaveBeenLastCalledWith({
      where: { id: trainerId },
      data: { mfaEnabled: false, totpSecretEncrypted: null },
    });
  });

  it('consumes backup code atomically only when unused row matches and updateMany claims 1 row', async () => {
    const prisma = createDeepPrismaMock();
    const repo = new MfaTotpRepository(prisma);

    prisma.mfaBackupCode.findFirst.mockResolvedValueOnce(null);
    expect(await repo.consumeUnusedBackupCode(trainerId, 'hash-missing')).toBe(
      false,
    );
    expect(prisma.mfaBackupCode.updateMany).not.toHaveBeenCalled();

    prisma.mfaBackupCode.findFirst.mockResolvedValueOnce({
      id: 'bk-1',
    } as never);
    prisma.mfaBackupCode.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await repo.consumeUnusedBackupCode(trainerId, 'hash-race')).toBe(
      false,
    );

    prisma.mfaBackupCode.findFirst.mockResolvedValueOnce({
      id: 'bk-2',
    } as never);
    prisma.mfaBackupCode.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await repo.consumeUnusedBackupCode(trainerId, 'hash-ok')).toBe(true);
  });
});
