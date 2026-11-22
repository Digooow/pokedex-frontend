import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import type { SessionTrainerRecord } from './session.service';
import {
  MAX_PASSKEYS_PER_TRAINER,
  PASSKEY_SUMMARY_SELECT,
  type PersistedPasskeySummary,
  TRAINER_SESSION_SELECT,
} from './trainer-account.repository';

export interface PasskeyCredentialDescriptor {
  readonly credentialId: string;
  transports: string[];
}

export interface TrainerPasskeyRegistrationRecord {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly passkeys: readonly PasskeyCredentialDescriptor[];
}

export interface CreatePasskeyParams {
  readonly trainerId: string;
  readonly credentialId: string;
  readonly publicKey: string;
  readonly counter: number;
  readonly deviceType: string;
  readonly backedUp: boolean;
  readonly transports: string[];
  readonly label: string;
}

export interface PasskeyAssertionRecord {
  readonly id: string;
  readonly trainerId: string;
  readonly credentialId: string;
  readonly publicKey: string;
  readonly counter: number;
  transports: string[];
  readonly trainer: SessionTrainerRecord;
}

@Injectable()
export class PasskeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  listPasskeysByTrainer(
    trainerId: string,
    limit: number = MAX_PASSKEYS_PER_TRAINER,
  ): Promise<PersistedPasskeySummary[]> {
    return this.prisma.trainerPasskey.findMany({
      where: { trainerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: PASSKEY_SUMMARY_SELECT,
    });
  }

  async deletePasskeyForTrainer(
    trainerId: string,
    passkeyId: string,
  ): Promise<boolean> {
    const deleted = await this.prisma.trainerPasskey.deleteMany({
      where: { id: passkeyId, trainerId },
    });
    return deleted.count > 0;
  }

  findTrainerForRegistration(
    trainerId: string,
    limit: number = MAX_PASSKEYS_PER_TRAINER,
  ): Promise<TrainerPasskeyRegistrationRecord | null> {
    return this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: {
        id: true,
        username: true,
        email: true,
        passkeys: {
          select: { credentialId: true, transports: true },
          take: limit,
        },
      },
    });
  }

  createPasskey(params: CreatePasskeyParams): Promise<PersistedPasskeySummary> {
    return this.prisma.trainerPasskey.create({
      data: {
        trainerId: params.trainerId,
        credentialId: params.credentialId,
        publicKey: params.publicKey,
        counter: params.counter,
        deviceType: params.deviceType,
        backedUp: params.backedUp,
        transports: params.transports,
        label: params.label,
      },
      select: PASSKEY_SUMMARY_SELECT,
    });
  }

  async findPasskeyDescriptorsForLogin(
    selector: { readonly trainerId: string } | { readonly email: string },
    limit: number = MAX_PASSKEYS_PER_TRAINER,
  ): Promise<PasskeyCredentialDescriptor[]> {
    const trainer = await this.prisma.trainer.findFirst({
      where:
        'trainerId' in selector
          ? { id: selector.trainerId }
          : { email: selector.email },
      select: {
        passkeys: {
          select: { credentialId: true, transports: true },
          take: limit,
        },
      },
    });

    return trainer?.passkeys ?? [];
  }

  findByCredentialIdWithTrainer(
    credentialId: string,
  ): Promise<PasskeyAssertionRecord | null> {
    return this.prisma.trainerPasskey.findUnique({
      where: { credentialId },
      select: {
        id: true,
        trainerId: true,
        credentialId: true,
        publicKey: true,
        counter: true,
        transports: true,
        trainer: {
          select: TRAINER_SESSION_SELECT,
        },
      },
    });
  }

  async updateUsage(
    passkeyId: string,
    counter: number,
    lastUsedAt: Date,
  ): Promise<void> {
    await this.prisma.trainerPasskey.update({
      where: { id: passkeyId },
      data: { counter, lastUsedAt },
    });
  }
}
