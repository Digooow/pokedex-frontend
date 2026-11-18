import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleOAuthController } from './google-oauth.controller';
import { GoogleOAuthService } from './google-oauth.service';
import { MfaTotpService } from './mfa-totp.service';
import { MfaController } from './mfa.controller';
import { OtpService } from './otp.service';
import { PasskeyService } from './passkey.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController, MfaController, GoogleOAuthController],
  providers: [
    AuthService,
    SessionService,
    OtpService,
    MfaTotpService,
    PasskeyService,
    GoogleOAuthService,
  ],
  exports: [
    AuthService,
    SessionService,
    OtpService,
    MfaTotpService,
    PasskeyService,
    GoogleOAuthService,
  ],
})
export class AuthModule {}
