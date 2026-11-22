import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthSessionResponse } from '@pokeverse/shared';
import { PrismaService } from '../../infra/prisma.service';
import { AuthOutboxPublisher } from './auth-outbox-publisher.service';
import type { VerifiedGoogleClaims } from './google-oidc.verifier';
import {
  TRAINER_AUTH_SELECT,
  TRAINER_PROFILE_SELECT,
  type TrainerAuthRecord,
  TrainerSessionIssuer,
} from './trainer-session-issuer.service';

export interface GoogleAccountResolutionResult {
  readonly redirectUrl: string;
  readonly sessionSid?: string;
  readonly refreshToken?: string | null;
  readonly session?: AuthSessionResponse;
}

@Injectable()
export class GoogleAccountLinker {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionIssuer: TrainerSessionIssuer,
    private readonly outboxPublisher: AuthOutboxPublisher,
  ) {}

  async resolveTrainerAccount(
    claims: VerifiedGoogleClaims,
    linkTrainerId: string | null,
    traceId: string | null,
    baseRedirect: string,
  ): Promise<GoogleAccountResolutionResult> {
    if (linkTrainerId) {
      return this.linkToExistingSessionTrainer(
        claims,
        linkTrainerId,
        baseRedirect,
      );
    }

    const linkedOAuth = await this.prisma.trainerOAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: claims.sub,
        },
      },
      select: {
        trainer: {
          select: TRAINER_AUTH_SELECT,
        },
      },
    });

    if (linkedOAuth) {
      return this.issueTrainerSession(linkedOAuth.trainer, baseRedirect);
    }

    const trainerByEmail = await this.prisma.trainer.findUnique({
      where: { email: claims.email },
      select: TRAINER_AUTH_SELECT,
    });

    if (trainerByEmail) {
      if (trainerByEmail.emailVerifiedAt === null) {
        return {
          redirectUrl: `${baseRedirect}/?authError=verify_email_before_google_link`,
        };
      }

      await this.prisma.trainerOAuthAccount.create({
        data: {
          trainerId: trainerByEmail.id,
          provider: 'google',
          providerAccountId: claims.sub,
          email: claims.email,
        },
      });
      return this.issueTrainerSession(trainerByEmail, baseRedirect);
    }

    const createdTrainer = await this.createNewGoogleTrainer(claims, traceId);
    return this.issueTrainerSession(
      {
        ...createdTrainer,
        totpSecretEncrypted: null,
        passwordHash: null,
        passkeys: [],
      },
      baseRedirect,
    );
  }

  async unlinkGoogle(trainerId: string): Promise<void> {
    const trainer = await this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: {
        passwordHash: true,
        passkeys: { select: { id: true } },
        oauthAccounts: { select: { id: true, provider: true } },
      },
    });

    if (!trainer) {
      throw new UnauthorizedException('Treinador não encontrado.');
    }

    const hasOtherAuth =
      trainer.passwordHash !== null ||
      trainer.passkeys.length > 0 ||
      trainer.oauthAccounts.some((acc) => acc.provider !== 'google');

    if (!hasOtherAuth) {
      throw new BadRequestException(
        'Defina uma senha ou cadastre uma Passkey antes de desvincular sua conta Google.',
      );
    }

    await this.prisma.trainerOAuthAccount.deleteMany({
      where: { trainerId, provider: 'google' },
    });
  }

  private async linkToExistingSessionTrainer(
    claims: VerifiedGoogleClaims,
    linkTrainerId: string,
    baseRedirect: string,
  ): Promise<GoogleAccountResolutionResult> {
    const existingOAuth = await this.prisma.trainerOAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: claims.sub,
        },
      },
      select: { trainerId: true },
    });

    if (existingOAuth && existingOAuth.trainerId !== linkTrainerId) {
      return {
        redirectUrl: `${baseRedirect}/?authError=google_already_linked`,
      };
    }

    if (!existingOAuth) {
      await this.prisma.trainerOAuthAccount.create({
        data: {
          trainerId: linkTrainerId,
          provider: 'google',
          providerAccountId: claims.sub,
          email: claims.email,
        },
      });
    }

    return { redirectUrl: `${baseRedirect}/?googleLinked=1` };
  }

  private async issueTrainerSession(
    trainer: TrainerAuthRecord,
    baseRedirect: string,
  ): Promise<GoogleAccountResolutionResult> {
    const issued =
      await this.sessionIssuer.issueAuthenticatedOrMfaSession(trainer);

    return {
      redirectUrl: issued.requiresMfa
        ? `${baseRedirect}/?mfaPending=1`
        : `${baseRedirect}/`,
      sessionSid: issued.sessionSid,
      refreshToken: issued.refreshToken,
      session: issued.session,
    };
  }

  private createNewGoogleTrainer(
    claims: VerifiedGoogleClaims,
    traceId: string | null,
  ) {
    const baseName = (claims.name ?? claims.email.split('@')[0] ?? 'Trainer')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 18);
    const prefix = baseName.length >= 3 ? baseName : 'Trainer';
    return this.createTrainerWithUniqueUsername(claims, prefix, traceId, 0);
  }

  private async createTrainerWithUniqueUsername(
    claims: VerifiedGoogleClaims,
    prefix: string,
    traceId: string | null,
    attempt: number,
  ): Promise<
    ReturnType<GoogleAccountLinker['tryCreateGoogleTrainerTransaction']>
  > {
    if (attempt >= 4) {
      throw new ConflictException(
        'Não foi possível reservar nome de treinador único para conta Google.',
      );
    }

    const candidateUsername =
      attempt === 0 ? prefix : `${prefix}_${randomBytes(2).toString('hex')}`;

    try {
      return await this.tryCreateGoogleTrainerTransaction(
        claims,
        candidateUsername,
        traceId,
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.createTrainerWithUniqueUsername(
          claims,
          prefix,
          traceId,
          attempt + 1,
        );
      }
      throw error;
    }
  }

  private tryCreateGoogleTrainerTransaction(
    claims: VerifiedGoogleClaims,
    candidateUsername: string,
    traceId: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const trainer = await tx.trainer.create({
        data: {
          username: candidateUsername.slice(0, 24),
          email: claims.email,
          passwordHash: null,
          emailVerifiedAt: new Date(),
        },
        select: TRAINER_PROFILE_SELECT,
      });

      await tx.trainerOAuthAccount.create({
        data: {
          trainerId: trainer.id,
          provider: 'google',
          providerAccountId: claims.sub,
          email: claims.email,
        },
      });

      await this.outboxPublisher.enqueueTrainerRegisteredWorldEvent(tx, {
        trainerId: trainer.id,
        username: trainer.username,
        traceId,
      });

      return trainer;
    });
  }
}
