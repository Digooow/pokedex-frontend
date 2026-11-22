import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ForgotPasswordInput,
  LoginTrainerInput,
  RegisterTrainerInput,
  ResendEmailOtpInput,
  ResetPasswordOtpInput,
  VerifyEmailOtpInput,
} from '@pokeverse/shared';
import { CryptoService } from '../../common/security/crypto.service';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { AccountRecoveryService } from './account-recovery.service';
import { AuthOutboxPublisher } from './auth-outbox-publisher.service';
import { CredentialsAuthService } from './credentials-auth.service';
import { OtpService } from './otp.service';
import { SessionManagementService } from './session-management.service';
import { SessionService } from './session.service';
import { TokenRefreshService } from './token-refresh.service';
import { TrainerGdprService } from './trainer-gdpr.service';
import {
  type AuthSessionWithCookies,
  TrainerSessionIssuer,
} from './trainer-session-issuer.service';

export type { AuthSessionWithCookies };

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly credentialsAuth: CredentialsAuthService;
  private readonly tokenRefresh: TokenRefreshService;
  private readonly accountRecovery: AccountRecoveryService;
  private readonly sessionManagement: SessionManagementService;
  private readonly trainerGdpr: TrainerGdprService;

  constructor(
    prisma: PrismaService,
    redis: RedisService,
    crypto: CryptoService,
    sessionService: SessionService,
    otpService: OtpService,
    config: ConfigService<ApiEnvConfig, true>,
    logger: StructuredLoggerService,
    @Optional() credentialsAuth?: CredentialsAuthService,
    @Optional() tokenRefresh?: TokenRefreshService,
    @Optional() accountRecovery?: AccountRecoveryService,
    @Optional() sessionManagement?: SessionManagementService,
    @Optional() trainerGdpr?: TrainerGdprService,
  ) {
    const outbox = new AuthOutboxPublisher(crypto);
    const issuer = new TrainerSessionIssuer(
      prisma,
      crypto,
      sessionService,
      config,
    );
    this.credentialsAuth =
      credentialsAuth ??
      new CredentialsAuthService(
        prisma,
        redis,
        crypto,
        sessionService,
        otpService,
        issuer,
        outbox,
        config,
        logger,
      );
    this.tokenRefresh =
      tokenRefresh ??
      new TokenRefreshService(
        prisma,
        redis,
        crypto,
        sessionService,
        issuer,
        logger,
      );
    this.accountRecovery =
      accountRecovery ??
      new AccountRecoveryService(prisma, sessionService, otpService, outbox);
    this.sessionManagement =
      sessionManagement ??
      new SessionManagementService(prisma, sessionService, config);
    this.trainerGdpr =
      trainerGdpr ??
      new TrainerGdprService(prisma, redis, crypto, sessionService);
  }

  onModuleInit = () => this.credentialsAuth.onModuleInit();

  register = (input: RegisterTrainerInput, traceId: string | null) =>
    this.credentialsAuth.register(input, traceId);

  login = (input: LoginTrainerInput, clientIp: string) =>
    this.credentialsAuth.login(input, clientIp);

  getSessionBootstrap = (rawSid?: string, rawRefreshToken?: string) =>
    this.tokenRefresh.getSessionBootstrap(rawSid, rawRefreshToken);

  refresh = (rawRefreshToken?: string, previousRawSid?: string) =>
    this.tokenRefresh.refresh(rawRefreshToken, previousRawSid);

  logout = (rawSid?: string, rawRefreshToken?: string) =>
    this.tokenRefresh.logout(rawSid, rawRefreshToken);

  verifyEmailOtp = (input: VerifyEmailOtpInput, traceId: string | null) =>
    this.accountRecovery.verifyEmailOtp(input, traceId);

  resendVerificationOtp = (
    input: ResendEmailOtpInput,
    traceId: string | null,
  ) => this.accountRecovery.resendVerificationOtp(input, traceId);

  forgotPassword = (input: ForgotPasswordInput, traceId: string | null) =>
    this.accountRecovery.forgotPassword(input, traceId);

  resetPasswordWithOtp = (
    input: ResetPasswordOtpInput,
    traceId: string | null,
  ) => this.accountRecovery.resetPasswordWithOtp(input, traceId);

  getMe = (trainerId: string) => this.credentialsAuth.getMe(trainerId);

  getProvidersAvailability = () =>
    this.credentialsAuth.getProvidersAvailability();

  getSecurityOverview = (trainerId: string) =>
    this.sessionManagement.getSecurityOverview(trainerId);

  listActiveSessions = (trainerId: string, currentFamilyId: string) =>
    this.sessionManagement.listActiveSessions(trainerId, currentFamilyId);

  revokeOtherSessions = (trainerId: string, currentFamilyId: string) =>
    this.sessionManagement.revokeOtherSessions(trainerId, currentFamilyId);

  purgeExpiredTokensAndEvents = (now?: Date) =>
    this.sessionManagement.purgeExpiredTokensAndEvents(now);

  exportTrainerData = (trainerId: string) =>
    this.trainerGdpr.exportTrainerData(trainerId);

  deleteTrainerAccount = (
    trainerId: string,
    rawSid?: string,
    rawRefreshToken?: string,
  ) =>
    this.trainerGdpr.deleteTrainerAccount(trainerId, rawSid, rawRefreshToken);
}
