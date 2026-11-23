import { Injectable } from '@nestjs/common';
import { TOTAL_POKEDEX_SLOTS } from '@pokeverse/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma.service';
import type { AuthOutboxCreateInput } from './auth-outbox-publisher.service';
import type { SessionTrainerRecord } from './session.service';

export const MAX_PASSKEYS_PER_TRAINER = 50;
export const MAX_OAUTH_ACCOUNTS_PER_TRAINER = 10;

export const TRAINER_PROFILE_SELECT = {
  id: true,
  username: true,
  email: true,
  emailVerifiedAt: true,
  mfaEnabled: true,
  role: true,
  badgesCount: true,
  eloRating: true,
  lastMapId: true,
  lastX: true,
  lastY: true,
  createdAt: true,
} as const;

export const TRAINER_SESSION_SELECT = {
  ...TRAINER_PROFILE_SELECT,
  passwordHash: true,
} as const;

export const TRAINER_AUTH_SELECT = {
  ...TRAINER_SESSION_SELECT,
  totpSecretEncrypted: true,
  passkeys: { select: { id: true }, take: 1 },
} as const;

export const PASSKEY_SUMMARY_SELECT = {
  id: true,
  label: true,
  deviceType: true,
  backedUp: true,
  createdAt: true,
  lastUsedAt: true,
} as const;

export interface TrainerAuthRecord extends SessionTrainerRecord {
  readonly totpSecretEncrypted: string | null;
  readonly passkeys: readonly { readonly id: string }[];
}

export interface PersistedPasskeySummary {
  readonly id: string;
  readonly label: string;
  readonly deviceType: string;
  readonly backedUp: boolean;
  readonly createdAt: Date;
  readonly lastUsedAt: Date | null;
}

export interface TrainerVerificationIdentity {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
}

export interface TrainerBasicIdentity {
  readonly id: string;
  readonly username: string;
  readonly email: string;
}

export interface PersistedSecurityOverview {
  readonly mfaEnabled: boolean;
  readonly oauthAccounts: readonly { readonly email: string }[];
  readonly passkeys: readonly PersistedPasskeySummary[];
}

export interface PersistedTrainerExport extends SessionTrainerRecord {
  readonly oauthAccounts: readonly {
    readonly provider: string;
    readonly email: string;
    readonly createdAt: Date;
  }[];
  readonly passkeys: readonly PersistedPasskeySummary[];
  readonly pokedexSlots: readonly {
    readonly slotIndex: number;
    readonly pokemonId: number;
    readonly pokemonName: string;
    readonly nickname: string | null;
    readonly spriteUrl: string | null;
    readonly updatedAt: Date;
  }[];
}

export interface RegisterTrainerParams {
  readonly trainerId: string;
  readonly username: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly refreshToken: {
    readonly tokenHash: string;
    readonly familyId: string;
    readonly expiresAt: Date;
  };
  readonly worldOutboxEvent: AuthOutboxCreateInput;
  readonly emailOutboxEvent: AuthOutboxCreateInput;
}

export type RegisterTrainerResult =
  | { readonly status: 'conflict' }
  | { readonly status: 'created'; readonly trainer: SessionTrainerRecord };

@Injectable()
export class TrainerAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSessionRecordById(
    trainerId: string,
  ): Promise<SessionTrainerRecord | null> {
    return this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: TRAINER_SESSION_SELECT,
    });
  }

  findAuthRecordByEmail(email: string): Promise<TrainerAuthRecord | null> {
    return this.prisma.trainer.findUnique({
      where: { email },
      select: TRAINER_AUTH_SELECT,
    });
  }

  findVerificationIdentityByEmail(
    email: string,
  ): Promise<TrainerVerificationIdentity | null> {
    return this.prisma.trainer.findUnique({
      where: { email },
      select: { id: true, username: true, email: true, emailVerifiedAt: true },
    });
  }

  findBasicIdentityByEmail(
    email: string,
  ): Promise<TrainerBasicIdentity | null> {
    return this.prisma.trainer.findUnique({
      where: { email },
      select: { id: true, username: true, email: true },
    });
  }

  async registerTrainerWithSessionAndOutbox(
    params: RegisterTrainerParams,
  ): Promise<RegisterTrainerResult> {
    try {
      const trainer = await this.prisma.$transaction(async (tx) => {
        const created = await tx.trainer.create({
          data: {
            id: params.trainerId,
            username: params.username,
            email: params.email,
            passwordHash: params.passwordHash,
          },
          select: TRAINER_SESSION_SELECT,
        });

        await tx.refreshToken.create({
          data: {
            trainerId: created.id,
            tokenHash: params.refreshToken.tokenHash,
            familyId: params.refreshToken.familyId,
            expiresAt: params.refreshToken.expiresAt,
          },
        });

        await tx.outboxEvent.create({ data: params.worldOutboxEvent });
        await tx.outboxEvent.create({ data: params.emailOutboxEvent });

        return created;
      });

      return { status: 'created', trainer };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { status: 'conflict' };
      }
      throw error;
    }
  }

  async markEmailVerifiedWithOutbox(
    trainerId: string,
    outboxEvent: AuthOutboxCreateInput,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.trainer.update({
        where: { id: trainerId },
        data: { emailVerifiedAt: new Date() },
      });
      await tx.outboxEvent.create({ data: outboxEvent });
    });
  }

  async enqueueOutboxEvent(outboxEvent: AuthOutboxCreateInput): Promise<void> {
    await this.prisma.outboxEvent.create({ data: outboxEvent });
  }

  async resetPasswordAndRevokeTokensWithOutbox(
    trainerId: string,
    passwordHash: string,
    outboxEvent: AuthOutboxCreateInput,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.trainer.update({
        where: { id: trainerId },
        data: { passwordHash },
      });
      await tx.refreshToken.updateMany({
        where: { trainerId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.outboxEvent.create({ data: outboxEvent });
    });
  }

  findSecurityOverviewById(
    trainerId: string,
  ): Promise<PersistedSecurityOverview | null> {
    return this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: {
        mfaEnabled: true,
        oauthAccounts: {
          where: { provider: 'google' },
          select: { email: true },
          take: 1,
        },
        passkeys: {
          orderBy: { createdAt: 'desc' },
          take: MAX_PASSKEYS_PER_TRAINER,
          select: PASSKEY_SUMMARY_SELECT,
        },
      },
    });
  }

  findExportSnapshotById(
    trainerId: string,
  ): Promise<PersistedTrainerExport | null> {
    return this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: {
        ...TRAINER_SESSION_SELECT,
        oauthAccounts: {
          orderBy: { createdAt: 'asc' },
          take: MAX_OAUTH_ACCOUNTS_PER_TRAINER,
          select: {
            provider: true,
            email: true,
            createdAt: true,
          },
        },
        passkeys: {
          orderBy: { createdAt: 'desc' },
          take: MAX_PASSKEYS_PER_TRAINER,
          select: PASSKEY_SUMMARY_SELECT,
        },
        pokedexSlots: {
          orderBy: { slotIndex: 'asc' },
          take: TOTAL_POKEDEX_SLOTS,
          select: {
            slotIndex: true,
            pokemonId: true,
            pokemonName: true,
            nickname: true,
            spriteUrl: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  async deleteTrainerById(trainerId: string): Promise<boolean> {
    try {
      await this.prisma.trainer.delete({ where: { id: trainerId } });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return false;
      }
      throw error;
    }
  }
}
