import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  ForgotPasswordInput,
  LoginTrainerInput,
  RegisterTrainerInput,
  ResendEmailOtpInput,
  ResetPasswordOtpInput,
  VerifyEmailOtpInput,
} from '@pokeverse/shared';
import { AccountRecoveryService } from './account-recovery.service';
import { CredentialsAuthService } from './credentials-auth.service';
import { SessionManagementService } from './session-management.service';
import { TokenRefreshService } from './token-refresh.service';
import { TrainerGdprService } from './trainer-gdpr.service';

export type { AuthSessionWithCookies } from './trainer-session-issuer.service';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly credentialsAuth: CredentialsAuthService,
    private readonly tokenRefresh: TokenRefreshService,
    private readonly accountRecovery: AccountRecoveryService,
    private readonly sessionManagement: SessionManagementService,
    private readonly trainerGdpr: TrainerGdprService,
  ) {}

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
