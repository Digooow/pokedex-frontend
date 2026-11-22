import { Module } from '@nestjs/common';
import { AccountRecoveryService } from './account-recovery.service';
import { AuthController } from './auth.controller';
import { AuthOutboxPublisher } from './auth-outbox-publisher.service';
import { AuthService } from './auth.service';
import { CredentialsAuthService } from './credentials-auth.service';
import { GoogleAccountLinker } from './google-account-linker.service';
import { GoogleOAuthHttpClient } from './google-oauth-http.client';
import { GoogleOAuthController } from './google-oauth.controller';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleOidcVerifier } from './google-oidc.verifier';
import { MfaTotpService } from './mfa-totp.service';
import { MfaController } from './mfa.controller';
import { OtpService } from './otp.service';
import { PasskeyService } from './passkey.service';
import { SessionManagementService } from './session-management.service';
import { SessionService } from './session.service';
import { TokenRefreshService } from './token-refresh.service';
import { TrainerGdprService } from './trainer-gdpr.service';
import { TrainerSessionIssuer } from './trainer-session-issuer.service';

@Module({
  controllers: [AuthController, MfaController, GoogleOAuthController],
  providers: [
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
