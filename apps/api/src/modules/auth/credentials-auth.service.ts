import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  LoginTrainerInput,
  RegisterTrainerInput,
  TrainerProfile,
} from '@pokeverse/shared';
import * as argon2 from 'argon2';
import { CryptoService } from '../../common/security/crypto.service';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import { RedisService } from '../../infra/redis.service';
import { AuthOutboxPublisher } from './auth-outbox-publisher.service';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';
import { TrainerAccountRepository } from './trainer-account.repository';
import {
  type AuthSessionWithCookies,
  TrainerSessionIssuer,
  resolveProvidersAvailability,
} from './trainer-session-issuer.service';

const LOGIN_MAX_FAILURES = 8;
const LOGIN_LOCK_WINDOW_SEC = 300;

@Injectable()
export class CredentialsAuthService implements OnModuleInit {
  private dummyPasswordHash: string | null = null;

  constructor(
    private readonly trainerAccountRepository: TrainerAccountRepository,
    private readonly redis: RedisService,
    private readonly crypto: CryptoService,
    private readonly sessionService: SessionService,
    private readonly otpService: OtpService,
    private readonly sessionIssuer: TrainerSessionIssuer,
    private readonly outboxPublisher: AuthOutboxPublisher,
    private readonly config: ConfigService<ApiEnvConfig, true>,
    private readonly logger: StructuredLoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash ??= await argon2.hash(
      'pokeverse-timing-shield-key',
      {
        type: argon2.argon2id,
      },
    );
  }

  async register(
    input: RegisterTrainerInput,
    traceId: string | null,
  ): Promise<AuthSessionWithCookies> {
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    const rawRefresh = this.sessionIssuer.generateOpaqueRefreshToken();
    const tokenHash = this.crypto.sha256Hex(rawRefresh);
    const familyId = randomUUID();
    const expiresAt = this.sessionIssuer.computeRefreshExpiry();
    const otpDraft = this.otpService.createOtpDraft('verify', input.email);
    const trainerId = randomUUID();

    const result =
      await this.trainerAccountRepository.registerTrainerWithSessionAndOutbox({
        trainerId,
        username: input.username,
        email: input.email,
        passwordHash,
        refreshToken: { tokenHash, familyId, expiresAt },
        worldOutboxEvent: this.outboxPublisher.buildTrainerRegisteredWorldEvent(
          {
            trainerId,
            username: input.username,
            traceId,
          },
        ),
        emailOutboxEvent: this.outboxPublisher.buildEncryptedEmailEvent({
          aggregateId: trainerId,
          template: 'email_verification_otp',
          toEmail: input.email,
          username: input.username,
          subject: 'PokéVerse OS — Código de verificação de conta',
          otpCode: otpDraft.code,
          traceId,
        }),
      });

    if (result.status === 'conflict') {
      throw new ConflictException('Nome de treinador ou e-mail já cadastrado.');
    }

    await this.otpService.persistOtpDraft(otpDraft);

    const { rawSid, session } = await this.sessionService.createSession({
      trainerId: result.trainer.id,
      username: result.trainer.username,
      familyId,
      state: 'AUTHENTICATED',
      mfaMethods: [],
    });

    return {
      session: this.sessionService.buildAuthSessionResponse(
        result.trainer,
        session.state,
        session.mfaMethods,
      ),
      sessionSid: rawSid,
      refreshToken: rawRefresh,
    };
  }

  async login(
    input: LoginTrainerInput,
    clientIp: string,
  ): Promise<AuthSessionWithCookies> {
    const attemptKey = this.loginAttemptKey(clientIp, input.email);
    const currentAttempts = Number(
      (await this.redis.getString(attemptKey)) ?? '0',
    );
    if (currentAttempts >= LOGIN_MAX_FAILURES) {
      this.logger.emitEvent(
        'warn',
        `Login rate guard blocked excessive failed attempts from ${clientIp}`,
        {
          context: CredentialsAuthService.name,
          errorCode: 'LOGIN_RATE_LIMIT_HIT',
        },
      );
      throw new HttpException(
        'Muitas tentativas de login falharam. Aguarde alguns minutos e tente novamente.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const trainer = await this.trainerAccountRepository.findAuthRecordByEmail(
      input.email,
    );

    if (!trainer?.passwordHash) {
      const dummyHash = await this.getDummyHash();
      await argon2.verify(dummyHash, input.password).catch(() => false);
      await this.recordFailedLogin(attemptKey, currentAttempts);
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const validPassword = await argon2.verify(
      trainer.passwordHash,
      input.password,
    );
    if (!validPassword) {
      await this.recordFailedLogin(attemptKey, currentAttempts);
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    await this.redis.delKeys(attemptKey);
    const issued =
      await this.sessionIssuer.issueAuthenticatedOrMfaSession(trainer);
    return {
      session: issued.session,
      sessionSid: issued.sessionSid,
      refreshToken: issued.refreshToken,
    };
  }

  async getMe(trainerId: string): Promise<TrainerProfile> {
    const trainer =
      await this.trainerAccountRepository.findSessionRecordById(trainerId);

    if (!trainer) {
      throw new UnauthorizedException('Treinador não encontrado.');
    }

    return this.sessionService.toTrainerProfile(trainer);
  }

  getProvidersAvailability(): {
    readonly googleEnabled: boolean;
    readonly webauthnEnabled: boolean;
  } {
    return resolveProvidersAvailability(this.config);
  }

  private async getDummyHash(): Promise<string> {
    this.dummyPasswordHash ??= await argon2.hash(
      'pokeverse-timing-shield-key',
      {
        type: argon2.argon2id,
      },
    );
    return this.dummyPasswordHash;
  }

  private async recordFailedLogin(
    attemptKey: string,
    currentAttempts: number,
  ): Promise<void> {
    if (typeof this.redis.incrementCounterWithTtl === 'function') {
      await this.redis.incrementCounterWithTtl(
        attemptKey,
        LOGIN_LOCK_WINDOW_SEC,
      );
      return;
    }
    await this.redis.setStringEx(
      attemptKey,
      LOGIN_LOCK_WINDOW_SEC,
      String(currentAttempts + 1),
    );
  }

  private loginAttemptKey(clientIp: string, email: string): string {
    const identityHash = this.crypto.sha256Hex(`${clientIp}:${email}`);
    return `login_fail:${identityHash}`;
  }
}
