import { Injectable } from '@nestjs/common';
import type { TrainerRole } from '@pokeverse/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma.service';
import type { AuthOutboxCreateInput } from './auth-outbox-publisher.service';
import {
  MAX_OAUTH_ACCOUNTS_PER_TRAINER,
  TRAINER_AUTH_SELECT,
  TRAINER_PROFILE_SELECT,
  type TrainerAuthRecord,
} from './trainer-account.repository';

export interface CreatedGoogleTrainerRecord {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
  readonly mfaEnabled: boolean;
  readonly role?: TrainerRole;
  readonly badgesCount: number;
  readonly eloRating: number;
  readonly lastMapId: string;
  readonly lastX: number;
  readonly lastY: number;
  readonly createdAt: Date;
}

export type CreateGoogleTrainerResult =
  | { readonly status: 'conflict' }
  | {
      readonly status: 'created';
      readonly trainer: CreatedGoogleTrainerRecord;
    };

export interface UnlinkCandidatesRecord {
  readonly passwordHash: string | null;
  readonly passkeys: readonly { readonly id: string }[];
  readonly oauthAccounts: readonly {
    readonly id: string;
    readonly provider: string;
  }[];
}

@Injectable()
export class TrainerOAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findTrainerByGoogleAccountId(
    providerAccountId: string,
  ): Promise<TrainerAuthRecord | null> {
    const linkedOAuth = await this.prisma.trainerOAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId,
        },
      },
      select: {
        trainer: {
          select: TRAINER_AUTH_SELECT,
        },
      },
    });
    return linkedOAuth?.trainer ?? null;
  }

  findOwnerByGoogleAccountId(
    providerAccountId: string,
  ): Promise<{ readonly trainerId: string } | null> {
    return this.prisma.trainerOAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId,
        },
      },
      select: { trainerId: true },
    });
  }

  async createGoogleLink(params: {
    readonly trainerId: string;
    readonly providerAccountId: string;
    readonly email: string;
  }): Promise<void> {
    await this.prisma.trainerOAuthAccount.create({
      data: {
        trainerId: params.trainerId,
        provider: 'google',
        providerAccountId: params.providerAccountId,
        email: params.email,
      },
    });
  }

  async createGoogleTrainerWithOutbox(params: {
    readonly trainerId: string;
    readonly username: string;
    readonly providerAccountId: string;
    readonly email: string;
    readonly outboxEvent: AuthOutboxCreateInput;
  }): Promise<CreateGoogleTrainerResult> {
    try {
      const trainer = await this.prisma.$transaction(async (tx) => {
        const created = await tx.trainer.create({
          data: {
            id: params.trainerId,
            username: params.username,
            email: params.email,
            passwordHash: null,
            emailVerifiedAt: new Date(),
          },
          select: TRAINER_PROFILE_SELECT,
        });

        await tx.trainerOAuthAccount.create({
          data: {
            trainerId: created.id,
            provider: 'google',
            providerAccountId: params.providerAccountId,
            email: params.email,
          },
        });

        await tx.outboxEvent.create({ data: params.outboxEvent });

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

  findUnlinkCandidates(
    trainerId: string,
  ): Promise<UnlinkCandidatesRecord | null> {
    return this.prisma.trainer.findUnique({
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
  }

  async deleteGoogleLinks(trainerId: string): Promise<void> {
    await this.prisma.trainerOAuthAccount.deleteMany({
      where: { trainerId, provider: 'google' },
    });
  }
}
