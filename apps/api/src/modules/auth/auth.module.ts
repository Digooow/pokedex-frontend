import { Module } from '@nestjs/common';
import { RedisService } from '../../infra/redis.service';
import { AccountRecoveryService } from './account-recovery.service';
import { AuthOutboxPublisher } from './auth-outbox-publisher.service';
import { OTP_STORE, SESSION_REPOSITORY } from './auth-storage.ports';
import { AuthTokenRepository } from './auth-token.repository';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CredentialsAuthService } from './credentials-auth.service';
import { GoogleAccountLinker } from './google-account-linker.service';
import { GoogleOAuthHttpClient } from './google-oauth-http.client';
import { GoogleOAuthController } from './google-oauth.controller';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleOidcVerifier } from './google-oidc.verifier';
import { MfaTotpRepository } from './mfa-totp.repository';
import { MfaTotpService } from './mfa-totp.service';
import { MfaController } from './mfa.controller';
import { OtpService } from './otp.service';
import { PasskeyRepository } from './passkey.repository';
import { PasskeyService } from './passkey.service';
import { SessionManagementService } from './session-management.service';
import { SessionService } from './session.service';
import { TokenRefreshService } from './token-refresh.service';
import { TrainerAccountRepository } from './trainer-account.repository';
import { TrainerGdprService } from './trainer-gdpr.service';
import { TrainerOAuthRepository } from './trainer-oauth.repository';
import { TrainerSessionIssuer } from './trainer-session-issuer.service';

@Module({
  controllers: [AuthController, MfaController, GoogleOAuthController],
  providers: [
    { provide: SESSION_REPOSITORY, useExisting: RedisService },
    { provide: OTP_STORE, useExisting: RedisService },
    TrainerAccountRepository,
    AuthTokenRepository,
    MfaTotpRepository,
    PasskeyRepository,
    TrainerOAuthRepository,
    AuthService,
    TrainerSessionIssuer,
    AuthOutboxPublisher,
    CredentialsAuthService,
    TokenRefreshService,
    AccountRecoveryService,
    SessionManagementService,
    TrainerGdprService,
    SessionService,
    OtpService,
    MfaTotpService,
    PasskeyService,
    GoogleOAuthHttpClient,
    GoogleOidcVerifier,
    GoogleAccountLinker,
    GoogleOAuthService,
  ],
  exports: [
    TrainerAccountRepository,
    AuthTokenRepository,
    MfaTotpRepository,
    PasskeyRepository,
    TrainerOAuthRepository,
    AuthService,
    TrainerSessionIssuer,
    AuthOutboxPublisher,
    CredentialsAuthService,
    TokenRefreshService,
    AccountRecoveryService,
    SessionManagementService,
    TrainerGdprService,
    SessionService,
    OtpService,
    MfaTotpService,
    PasskeyService,
    GoogleOAuthHttpClient,
    GoogleOidcVerifier,
    GoogleAccountLinker,
    GoogleOAuthService,
  ],
})
export class AuthModule {}
