import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AuthSessionResponse,
  AuthSessionResponseSchema,
  type PasskeyLoginVerifyInput,
  type PasskeyRegisterVerifyInput,
  type PasskeySummary,
  PasskeySummarySchema,
  TrainerProfileSchema,
} from '@pokeverse/shared';
import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

type StoredTransports = NonNullable<WebAuthnCredential['transports']>;
import { CryptoService } from '../../common/security/crypto.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { SessionService } from './session.service';

const CHALLENGE_TTL_SEC = 120;

interface StoredAuthChallenge {
  readonly challenge: string;
  readonly expectedTrainerId: string | null;
}

@Injectable()
export class PasskeyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly crypto: CryptoService,
    private readonly sessionService: SessionService,
    private readonly config: ConfigService<ApiEnvConfig, true>,
  ) {}

  async listPasskeys(trainerId: string): Promise<PasskeySummary[]> {
    const rows = await this.prisma.trainerPasskey.findMany({
      where: { trainerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        deviceType: true,
        backedUp: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    return rows.map((row) =>
      PasskeySummarySchema.parse({
        ...row,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      }),
    );
  }

  async deletePasskey(trainerId: string, passkeyId: string): Promise<void> {
    const deleted = await this.prisma.trainerPasskey.deleteMany({
      where: { id: passkeyId, trainerId },
    });

    if (deleted.count === 0) {
      throw new NotFoundException('Passkey não encontrada para esta conta.');
    }
  }

  async generateRegisterOptions(trainerId: string) {
    const trainer = await this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: {
        id: true,
        username: true,
        email: true,
        passkeys: { select: { credentialId: true, transports: true } },
      },
    });

    if (!trainer) {
      throw new UnauthorizedException('Treinador não encontrado.');
    }

    const options = await generateRegistrationOptions({
      rpName: this.config.get('WEBAUTHN_RP_NAME', { infer: true }),
      rpID: this.config.get('WEBAUTHN_RP_ID', { infer: true }),
      userName: trainer.email,
      userDisplayName: trainer.username,
      userID: new Uint8Array(Buffer.from(trainer.id, 'utf8')),
      attestationType: 'none',
      excludeCredentials: trainer.passkeys.map((pk) => ({
        id: pk.credentialId,
        transports: pk.transports,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    await this.redis.setStringEx(
      this.regChallengeKey(trainerId),
      CHALLENGE_TTL_SEC,
      options.challenge,
    );

    return options;
  }

  async verifyAndSaveRegistration(
    trainerId: string,
    input: PasskeyRegisterVerifyInput,
  ): Promise<PasskeySummary> {
    const regKey = this.regChallengeKey(trainerId);
    const expectedChallenge = await this.redis.getString(regKey);
    await this.redis.delKeys(regKey);

    if (!expectedChallenge) {
      throw new BadRequestException(
        'Desafio de Passkey expirado. Tente registrar novamente.',
      );
    }

    const response = input.response as unknown as RegistrationResponseJSON;
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.getAllowedOrigins(),
      expectedRPID: this.config.get('WEBAUTHN_RP_ID', { infer: true }),
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException(
        'Falha na verificação criptográfica da Passkey.',
      );
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    const saved = await this.prisma.trainerPasskey.create({
      data: {
        trainerId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: credential.transports ?? [],
        label: input.label ?? 'Passkey do Dispositivo',
      },
      select: {
        id: true,
        label: true,
        deviceType: true,
        backedUp: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    return PasskeySummarySchema.parse({
      ...saved,
      createdAt: saved.createdAt.toISOString(),
      lastUsedAt: saved.lastUsedAt?.toISOString() ?? null,
    });
  }

  async generateLoginOptions(params: {
    readonly email?: string;
    readonly pendingTrainerId?: string;
  }) {
    const targetTrainerId = params.pendingTrainerId ?? null;
    let allowCredentials:
      Array<{ id: string; transports?: StoredTransports }> | undefined;

    if (targetTrainerId || params.email) {
      const trainer = await this.prisma.trainer.findFirst({
        where: targetTrainerId
          ? { id: targetTrainerId }
          : { email: params.email },
        select: {
          passkeys: { select: { credentialId: true, transports: true } },
        },
      });
      if (trainer && trainer.passkeys.length > 0) {
        allowCredentials = trainer.passkeys.map((pk) => ({
          id: pk.credentialId,
          transports: pk.transports,
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: this.config.get('WEBAUTHN_RP_ID', { infer: true }),
      userVerification: 'preferred',
      ...(allowCredentials ? { allowCredentials } : {}),
    });

    const challengeToken = randomBytes(24).toString('base64url');
    const stored: StoredAuthChallenge = {
      challenge: options.challenge,
      expectedTrainerId: targetTrainerId,
    };

    await this.redis.setJsonEx(
      this.authChallengeKey(challengeToken),
      CHALLENGE_TTL_SEC,
      stored,
    );

    return { challengeToken, options };
  }

  async verifyLoginAssertion(
    input: PasskeyLoginVerifyInput,
    currentRawSid?: string,
  ): Promise<{
    readonly session: AuthSessionResponse;
    readonly sessionSid: string;
    readonly refreshToken: string;
  }> {
    const challengeKey = this.authChallengeKey(input.challengeToken);
    const challengeRecord =
      await this.redis.getJson<StoredAuthChallenge>(challengeKey);
    await this.redis.delKeys(challengeKey);

    if (!challengeRecord) {
      throw new UnauthorizedException(
        'Desafio de Passkey expirado ou já utilizado.',
      );
    }

    const authResponse =
      input.response as unknown as AuthenticationResponseJSON;
    if (typeof authResponse.id !== 'string' || !authResponse.id) {
      throw new BadRequestException('Credencial WebAuthn ausente.');
    }

    const passkey = await this.prisma.trainerPasskey.findUnique({
      where: { credentialId: authResponse.id },
      select: {
        id: true,
        trainerId: true,
        credentialId: true,
        publicKey: true,
        counter: true,
        transports: true,
        trainer: {
          select: {
            id: true,
            username: true,
            email: true,
            emailVerifiedAt: true,
            mfaEnabled: true,
            passwordHash: true,
            badgesCount: true,
            eloRating: true,
            lastMapId: true,
            lastX: true,
            lastY: true,
            createdAt: true,
          },
        },
      },
    });

    if (
      !passkey ||
      (challengeRecord.expectedTrainerId &&
        passkey.trainerId !== challengeRecord.expectedTrainerId)
    ) {
      throw new UnauthorizedException('Passkey não reconhecida.');
    }

    const verification = await verifyAuthenticationResponse({
      response: authResponse,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: this.getAllowedOrigins(),
      expectedRPID: this.config.get('WEBAUTHN_RP_ID', { infer: true }),
      requireUserVerification: false,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
        counter: passkey.counter,
        transports: passkey.transports,
      },
    });

    if (!verification.verified) {
      throw new UnauthorizedException('Assinatura da Passkey inválida.');
    }

    await this.prisma.trainerPasskey.update({
      where: { id: passkey.id },
      data: {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      },
    });

    let activeSid = currentRawSid;
    let familyId: string = randomUUID();
    let mfaMethods: readonly ('totp' | 'backup_code' | 'passkey')[] = [
      'passkey',
    ];

    if (currentRawSid && challengeRecord.expectedTrainerId) {
      const promoted =
        await this.sessionService.promoteToAuthenticated(currentRawSid);
      if (promoted) {
        familyId = promoted.familyId;
        mfaMethods = promoted.mfaMethods;
      } else {
        activeSid = undefined;
      }
    }

    if (!activeSid) {
      const created = await this.sessionService.createSession({
        trainerId: passkey.trainer.id,
        username: passkey.trainer.username,
        familyId,
        state: 'AUTHENTICATED',
        mfaMethods: ['passkey'],
      });
      activeSid = created.rawSid;
    }

    const rawRefresh = randomBytes(48).toString('hex');
    const refreshDays = this.config.get('REFRESH_TTL_DAYS', { infer: true });
    await this.prisma.refreshToken.create({
      data: {
        trainerId: passkey.trainer.id,
        tokenHash: this.crypto.sha256Hex(rawRefresh),
        familyId,
        expiresAt: new Date(Date.now() + refreshDays * 86_400_000),
      },
    });

    const session = AuthSessionResponseSchema.parse({
      authenticated: true,
      sessionState: 'AUTHENTICATED',
      mfaMethods: [...mfaMethods],
      expiresInSec: this.sessionService.getSessionTtlSec(),
      trainer: TrainerProfileSchema.parse({
        id: passkey.trainer.id,
        username: passkey.trainer.username,
        email: passkey.trainer.email,
        emailVerifiedAt: passkey.trainer.emailVerifiedAt?.toISOString() ?? null,
        mfaEnabled: passkey.trainer.mfaEnabled,
        hasPassword: passkey.trainer.passwordHash !== null,
        badgesCount: passkey.trainer.badgesCount,
        eloRating: passkey.trainer.eloRating,
        lastMapId: passkey.trainer.lastMapId,
        lastX: passkey.trainer.lastX,
        lastY: passkey.trainer.lastY,
        createdAt: passkey.trainer.createdAt.toISOString(),
      }),
    });

    return { session, sessionSid: activeSid, refreshToken: rawRefresh };
  }

  private getAllowedOrigins(): string[] {
    const primary = this.config.get('WEBAUTHN_ORIGIN', { infer: true }).trim();
    const cors = this.config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return Array.from(new Set([primary, ...cors]));
  }

  private regChallengeKey(trainerId: string): string {
    return `webauthn_reg:${trainerId}`;
  }

  private authChallengeKey(challengeToken: string): string {
    return `webauthn_auth:${challengeToken}`;
  }
}
