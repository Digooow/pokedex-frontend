import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type AuthSessionResponse,
  type DisableTotpInput,
  DisableTotpSchema,
  type GenericMessageResponse,
  GenericMessageResponseSchema,
  type MfaChallengeVerifyInput,
  MfaChallengeVerifySchema,
  PasskeyIdParamSchema,
  type PasskeyLoginOptionsInput,
  PasskeyLoginOptionsSchema,
  type PasskeyLoginVerifyInput,
  PasskeyLoginVerifySchema,
  type PasskeyRegisterVerifyInput,
  PasskeyRegisterVerifySchema,
  type PasskeySummary,
  type SecurityOverviewResponse,
  type TotpCodeInput,
  TotpCodeInputSchema,
  type TotpEnableResponse,
  type TotpSetupResponse,
} from '@pokeverse/shared';
import type { Request, Response } from 'express';
import { AllowMfaPending } from '../../common/decorators/allow-mfa-pending.decorator';
import {
  type AuthenticatedTrainer,
  CurrentTrainer,
} from '../../common/decorators/current-trainer.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { readSessionCookie } from '../../common/guards/session-auth.guard';
import type { RequestWithTrace } from '../../common/middleware/correlation.middleware';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { MfaTotpService } from './mfa-totp.service';
import { PasskeyService } from './passkey.service';
import { writeAuthCookies } from './session-cookies.util';
import { SessionService } from './session.service';

@Controller('auth')
export class MfaController {
  constructor(
    private readonly authService: AuthService,
    private readonly totpService: MfaTotpService,
    private readonly passkeyService: PasskeyService,
    private readonly sessionService: SessionService,
  ) {}

  @Get('security/overview')
  getSecurityOverview(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
  ): Promise<SecurityOverviewResponse> {
    return this.authService.getSecurityOverview(trainer.trainerId);
  }

  @Post('mfa/totp/setup')
  setupTotp(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
  ): Promise<TotpSetupResponse> {
    return this.totpService.initiateSetup(trainer.trainerId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('mfa/totp/enable')
  enableTotp(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
    @Body(new ZodValidationPipe(TotpCodeInputSchema)) body: TotpCodeInput,
    @Req() req: RequestWithTrace,
  ): Promise<TotpEnableResponse> {
    return this.totpService.confirmEnable(
      trainer.trainerId,
      body.code,
      req.traceId ?? null,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('mfa/totp/disable')
  async disableTotp(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
    @Body(new ZodValidationPipe(DisableTotpSchema)) body: DisableTotpInput,
    @Req() req: RequestWithTrace,
  ): Promise<GenericMessageResponse> {
    const result = await this.totpService.disableTotp(
      trainer.trainerId,
      body,
      req.traceId ?? null,
    );
    return GenericMessageResponseSchema.parse(result);
  }

  @AllowMfaPending()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('mfa/verify')
  async verifyMfaChallenge(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
    @Body(new ZodValidationPipe(MfaChallengeVerifySchema))
    body: MfaChallengeVerifyInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponse> {
    const { sessionCookieName } = this.sessionService.getCookieNames();
    const rawSid = readSessionCookie(req, sessionCookieName);
    const result = await this.totpService.verifyChallengeAndPromote(
      rawSid,
      trainer.trainerId,
      body,
    );
    if (rawSid) {
      writeAuthCookies(res, this.sessionService, rawSid, result.refreshToken);
    }
    return result.session;
  }

  @Get('passkeys')
  async listPasskeys(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
  ): Promise<{ readonly passkeys: PasskeySummary[] }> {
    const passkeys = await this.passkeyService.listPasskeys(trainer.trainerId);
    return { passkeys };
  }

  @Post('passkeys/register/options')
  passkeyRegisterOptions(@CurrentTrainer() trainer: AuthenticatedTrainer) {
    return this.passkeyService.generateRegisterOptions(trainer.trainerId);
  }

  @Post('passkeys/register/verify')
  passkeyRegisterVerify(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
    @Body(new ZodValidationPipe(PasskeyRegisterVerifySchema))
    body: PasskeyRegisterVerifyInput,
  ): Promise<PasskeySummary> {
    return this.passkeyService.verifyAndSaveRegistration(
      trainer.trainerId,
      body,
    );
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('passkeys/:id')
  async deletePasskey(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
    @Param('id', new ZodValidationPipe(PasskeyIdParamSchema))
    passkeyId: string,
  ): Promise<void> {
    await this.passkeyService.deletePasskey(trainer.trainerId, passkeyId);
  }

  @Public()
  @AllowMfaPending()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('passkeys/login/options')
  async passkeyLoginOptions(
    @Body(new ZodValidationPipe(PasskeyLoginOptionsSchema))
    body: PasskeyLoginOptionsInput,
    @Req() req: Request,
  ) {
    const { sessionCookieName } = this.sessionService.getCookieNames();
    const rawSid = readSessionCookie(req, sessionCookieName);
    const activeSession = await this.sessionService.getSessionByRawSid(rawSid);
    return this.passkeyService.generateLoginOptions({
      email: body.email,
      pendingTrainerId:
        activeSession?.state === 'MFA_PENDING'
          ? activeSession.trainerId
          : undefined,
    });
  }

  @Public()
  @AllowMfaPending()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('passkeys/login/verify')
  async passkeyLoginVerify(
    @Body(new ZodValidationPipe(PasskeyLoginVerifySchema))
    body: PasskeyLoginVerifyInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponse> {
    const { sessionCookieName } = this.sessionService.getCookieNames();
    const rawSid = readSessionCookie(req, sessionCookieName);
    const result = await this.passkeyService.verifyLoginAssertion(body, rawSid);
    writeAuthCookies(
      res,
      this.sessionService,
      result.sessionSid,
      result.refreshToken,
    );
    return result.session;
  }
}
