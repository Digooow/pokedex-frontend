import type { PrismaService } from '../../infra/prisma.service';
import { PasskeyRepository } from './passkey.repository';
import {
  MAX_PASSKEYS_PER_TRAINER,
  PASSKEY_SUMMARY_SELECT,
} from './trainer-account.repository';

describe('PasskeyRepository (Prisma isolation & explicit take limits)', () => {
  const trainerId = '550e8400-e29b-41d4-a716-446655440000';
  const passkeyId = '550e8400-e29b-41d4-a716-446655440055';

  it('applies explicit take on listPasskeysByTrainer, registration lookup, and login descriptors', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const findUnique = jest.fn().mockResolvedValue(null);
    const findFirst = jest.fn().mockResolvedValue({
      passkeys: [{ credentialId: 'cred-1', transports: ['internal'] }],
    });

    const prismaMock = {
      trainerPasskey: { findMany },
      trainer: { findUnique, findFirst },
    } as unknown as PrismaService;

    const repository = new PasskeyRepository(prismaMock);

    await repository.listPasskeysByTrainer(trainerId);
    expect(findMany).toHaveBeenCalledWith({
      where: { trainerId },
      orderBy: { createdAt: 'desc' },
      take: MAX_PASSKEYS_PER_TRAINER,
      select: PASSKEY_SUMMARY_SELECT,
    });

    await repository.findTrainerForRegistration(trainerId);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: trainerId },
      select: {
        id: true,
        username: true,
        email: true,
        passkeys: {
          select: { credentialId: true, transports: true },
          take: MAX_PASSKEYS_PER_TRAINER,
        },
      },
    });

    const descriptors = await repository.findPasskeyDescriptorsForLogin({
      email: 'red@example.com',
    });
    expect(descriptors).toEqual([
      { credentialId: 'cred-1', transports: ['internal'] },
    ]);
    expect(findFirst).toHaveBeenCalledWith({
      where: { email: 'red@example.com' },
      select: {
        passkeys: {
          select: { credentialId: true, transports: true },
          take: MAX_PASSKEYS_PER_TRAINER,
        },
      },
    });
  });

  it('returns boolean outcome for deletePasskeyForTrainer', async () => {
    const deleteMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const prismaMock = {
      trainerPasskey: { deleteMany },
    } as unknown as PrismaService;

    const repository = new PasskeyRepository(prismaMock);
    expect(await repository.deletePasskeyForTrainer(trainerId, passkeyId)).toBe(
      true,
    );
    expect(await repository.deletePasskeyForTrainer(trainerId, passkeyId)).toBe(
      false,
    );
  });
});
