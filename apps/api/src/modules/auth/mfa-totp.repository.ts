import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import type { AuthOutboxCreateInput } from './auth-outbox-publisher.service';
import type { SessionTrainerRecord } from './session.service';
import { TRAINER_SESSION_SELECT } from './trainer-account.repository';

export interface TotpSetupStateRecord {
  readonly email: string;
  readonly mfaEnabled: boolean;
  readonly totpSecretEncrypted: string | null;
}

export interface TrainerContactRecord {
  readonly email: string;
  readonly username: string;
}

export interface MfaChallengeTrainerRecord extends SessionTrainerRecord {
  readonly totpSecretEncrypted: string | null;
}

export interface TotpDisableTrainerRecord {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly passwordHash: string | null;
  readonly mfaEnabled: boolean;
  readonly totpSecretEncrypted: string | null;
}

@Injectable()
export class MfaTotpRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTotpSetupState(trainerId: string): Promise<TotpSetupStateRecord | null> {
    return this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: { email: true, mfaEnabled: true, totpSecretEncrypted: true },
    });
  }

  findTrainerContact(trainerId: string): Promise<TrainerContactRecord | null> {
    return this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: { email: true, username: true },
    });
  }

  findForMfaChallenge(
    trainerId: string,
  ): Promise<MfaChallengeTrainerRecord | null> {
    return this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: {
        ...TRAINER_SESSION_SELECT,
        totpSecretEncrypted: true,
      },
    });
  }

  findForTotpDisable(
    trainerId: string,
  ): Promise<TotpDisableTrainerRecord | null> {
    return this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: {
        id: true,
        username: true,
        email: true,
        passwordHash: true,
        mfaEnabled: true,
        totpSecretEncrypted: true,
      },
    });
  }

  async enableTotpWithBackupCodesAndOutbox(params: {
    readonly trainerId: string;
    readonly secretEncrypted: string;
    readonly codeHashes: readonly string[];
    readonly outboxEvent: AuthOutboxCreateInput;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.trainer.update({
        where: { id: params.trainerId },
        data: {
          mfaEnabled: true,
          totpSecretEncrypted: params.secretEncrypted,
        },
      });

      await tx.mfaBackupCode.deleteMany({
        where: { trainerId: params.trainerId },
      });
      await tx.mfaBackupCode.createMany({
        data: params.codeHashes.map((codeHash) => ({
          trainerId: params.trainerId,
          codeHash,
        })),
      });

      await tx.outboxEvent.create({ data: params.outboxEvent });
    });
  }

  async disableTotpAndOutbox(params: {
    readonly trainerId: string;
    readonly outboxEvent: AuthOutboxCreateInput;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaBackupCode.deleteMany({
        where: { trainerId: params.trainerId },
      });
      await tx.trainer.update({
        where: { id: params.trainerId },
        data: {
          mfaEnabled: false,
          totpSecretEncrypted: null,
        },
      });

      await tx.outboxEvent.create({ data: params.outboxEvent });
    });
  }

  async consumeUnusedBackupCode(
    trainerId: string,
    codeHash: string,
  ): Promise<boolean> {
    const match = await this.prisma.mfaBackupCode.findFirst({
      where: { trainerId, codeHash, usedAt: null },
      select: { id: true },
    });

    if (!match) {
      return false;
    }

    const updated = await this.prisma.mfaBackupCode.updateMany({
      where: { id: match.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return updated.count === 1;
  }
}
