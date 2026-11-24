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
  type MfaMethod,
  type PasskeyLoginVerifyInput,
  type PasskeyRegisterVerifyInput,
  type PasskeySummary,
  PasskeySummarySchema,
} from '@pokeverse/shared';
import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { ApiEnvConfig } from '../../config/env.schema';
import { RedisService } from '../../infra/redis.service';
import {
  type PasskeyAssertionRecord,
  PasskeyRepository,
} from './passkey.repository';
import { SessionService } from './session.service';
import type { PersistedPasskeySummary } from './trainer-account.repository';
import { TrainerSessionIssuer } from './trainer-session-issuer.service';

const CHALLENGE_TTL_SEC = 120;

interface StoredAuthChallenge {
  readonly challenge: string;
  readonly expectedTrainerId: string | null;
}

interface PasskeyLoginResult {
  readonly session: AuthSessionResponse;
  readonly sessionSid: string;
  readonly refreshToken: string;
}

@Injectable()
export class PasskeyService {
  constructor(
    private readonly passkeyRepository: PasskeyRepository,
    private readonly redis: RedisService,
    private readonly sessionService: SessionService,
    private readonly sessionIssuer: TrainerSessionIssuer,
    private readonly config: ConfigService<ApiEnvConfig, true>,
  ) {}

  async listPasskeys(trainerId: string): Promise<PasskeySummary[]> {
    const rows = await this.passkeyRepository.listPasskeysByTrainer(trainerId);
    return rows.map((row) => this.toPasskeySummary(row));
  }

  async deletePasskey(trainerId: string, passkeyId: string): Promise<void> {
    const deleted = await this.passkeyRepository.deletePasskeyForTrainer(
      trainerId,
      passkeyId,
    );

    if (!deleted) {
      throw new NotFoundException('Passkey não encontrada para esta conta.');
    }
  }

  async generateRegisterOptions(trainerId: string) {
    const trainer =
      await this.passkeyRepository.findTrainerForRegistration(trainerId);

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
      `webauthn_reg:${trainerId}`,
      CHALLENGE_TTL_SEC,
      options.challenge,
    );
    return options;
  }

  async verifyAndSaveRegistration(
    trainerId: string,
    input: PasskeyRegisterVerifyInput,
  ): Promise<PasskeySummary> {
    const expectedChallenge = await this.redis.consumeString(
      `webauthn_reg:${trainerId}`,
    );
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
    }).catch(() => {
      throw new BadRequestException(
        'Falha na verificação criptográfica da Passkey.',
      );
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException(
        'Falha na verificação criptográfica da Passkey.',
      );
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    const saved = await this.passkeyRepository.createPasskey({
      trainerId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports ?? [],
      label: input.label ?? 'Passkey do Dispositivo',
    });

    return this.toPasskeySummary(saved);
  }

  async generateLoginOptions(params: {
    readonly email?: string;
    readonly pendingTrainerId?: string;
  }) {
    const targetTrainerId = params.pendingTrainerId ?? null;
    let selector:
      { readonly trainerId: string } | { readonly email: string } | null = null;
    if (targetTrainerId) {
      selector = { trainerId: targetTrainerId };
    } else if (params.email) {
      selector = { email: params.email };
    }
    const descriptors = selector
      ? await this.passkeyRepository.findPasskeyDescriptorsForLogin(selector)
      : [];

    const allowCredentials =
      descriptors.length > 0
        ? descriptors.map((pk) => ({
            id: pk.credentialId,
            transports: pk.transports,
          }))
        : undefined;

    const options = await generateAuthenticationOptions({
      rpID: this.config.get('WEBAUTHN_RP_ID', { infer: true }),
      userVerification: 'preferred',
      ...(allowCredentials ? { allowCredentials } : {}),
    });

    const challengeToken = randomBytes(24).toString('base64url');
    await this.redis.setJsonEx(
      `webauthn_auth:${challengeToken}`,
      CHALLENGE_TTL_SEC,
      { challenge: options.challenge, expectedTrainerId: targetTrainerId },
    );

    return { challengeToken, options };
  }

  async verifyLoginAssertion(
    input: PasskeyLoginVerifyInput,
    currentRawSid?: string,
  ): Promise<PasskeyLoginResult> {
    const challengeRecord = await this.redis.consumeJson<StoredAuthChallenge>(
      `webauthn_auth:${input.challengeToken}`,
    );
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

    const passkey = await this.passkeyRepository.findByCredentialIdWithTrainer(
      authResponse.id,
    );
    if (
      !passkey ||
      (challengeRecord.expectedTrainerId &&
        passkey.trainerId !== challengeRecord.expectedTrainerId)
    ) {
      throw new UnauthorizedException('Passkey não reconhecida.');
    }

    const newCounter = await this.verifyAssertionCryptographically(
      authResponse,
      challengeRecord.challenge,
      passkey,
    );
    await this.passkeyRepository.updateUsage(
      passkey.id,
      newCounter,
      new Date(),
    );

    return this.issuePasskeyLoginSession(
      passkey.trainer,
      challengeRecord.expectedTrainerId,
      currentRawSid,
    );
  }

  private async verifyAssertionCryptographically(
    authResponse: AuthenticationResponseJSON,
    expectedChallenge: string,
    passkey: PasskeyAssertionRecord,
  ): Promise<number> {
    const verification = await verifyAuthenticationResponse({
      response: authResponse,
      expectedChallenge,
      expectedOrigin: this.getAllowedOrigins(),
      expectedRPID: this.config.get('WEBAUTHN_RP_ID', { infer: true }),
      requireUserVerification: false,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
        counter: passkey.counter,
        transports: passkey.transports,
      },
    }).catch(() => {
      throw new UnauthorizedException('Assinatura da Passkey inválida.');
    });

    if (!verification.verified) {
      throw new UnauthorizedException('Assinatura da Passkey inválida.');
    }
    return verification.authenticationInfo.newCounter;
  }

  private async issuePasskeyLoginSession(
    trainer: PasskeyAssertionRecord['trainer'],
    expectedTrainerId: string | null,
    currentRawSid?: string,
  ): Promise<PasskeyLoginResult> {
    let activeSid = currentRawSid;
    let familyId: string = randomUUID();
    let mfaMethods: readonly MfaMethod[] = ['passkey'];

    if (currentRawSid && expectedTrainerId) {
      const promoted =
        await this.sessionService.promoteToAuthenticated(currentRawSid);
      activeSid = promoted ? (promoted.rawSid ?? currentRawSid) : undefined;
      if (promoted) {
        familyId = promoted.familyId;
        mfaMethods = promoted.mfaMethods;
      }
    }

    if (!activeSid) {
      const created = await this.sessionService.createSession({
        trainerId: trainer.id,
        username: trainer.username,
        role: trainer.role ?? 'TRAINER',
        familyId,
        state: 'AUTHENTICATED',
        mfaMethods: ['passkey'],
      });
      activeSid = created.rawSid;
    }

    const refreshToken = await this.sessionIssuer.createRefreshTokenRecord(
      trainer.id,
      familyId,
    );
    const session = this.sessionService.buildAuthSessionResponse(
      trainer,
      'AUTHENTICATED',
      mfaMethods,
    );
    return { session, sessionSid: activeSid, refreshToken };
  }

  private toPasskeySummary(row: PersistedPasskeySummary): PasskeySummary {
    return PasskeySummarySchema.parse({
      ...row,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    });
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
}
