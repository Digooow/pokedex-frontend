import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type ActiveSessionsResponse,
  type AuthSessionResponse,
  type ForgotPasswordInput,
  ForgotPasswordSchema,
  type GenericMessageResponse,
  GenericMessageResponseSchema,
  type LoginTrainerInput,
  LoginTrainerSchema,
  type RegisterTrainerInput,
  RegisterTrainerSchema,
  type ResendEmailOtpInput,
  ResendEmailOtpSchema,
  type ResetPasswordOtpInput,
  ResetPasswordOtpSchema,
  type RevokeOtherSessionsResponse,
  type SessionBootstrapResponse,
  type TrainerDataExport,
  type TrainerProfile,
  type VerifyEmailOtpInput,
  VerifyEmailOtpSchema,
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
import { clearAuthCookies, writeAuthCookies } from './session-cookies.util';
import { SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  @Public()
  @AllowMfaPending()
  @Get('providers')
  getProviders() {
    return this.authService.getProvidersAvailability();
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(RegisterTrainerSchema))
    body: RegisterTrainerInput,
    @Req() req: RequestWithTrace,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponse> {
    const result = await this.authService.register(body, req.traceId ?? null);
    writeAuthCookies(
      res,
      this.sessionService,
      result.sessionSid,
      result.refreshToken,
    );
    return result.session;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(LoginTrainerSchema)) body: LoginTrainerInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponse> {
    const clientIp = req.ip ?? 'unknown';
    const result = await this.authService.login(body, clientIp);
    writeAuthCookies(
      res,
      this.sessionService,
      result.sessionSid,
      result.refreshToken,
    );
    return result.session;
  }

  @Public()
  @AllowMfaPending()
  @Get('session')
  getSession(@Req() req: Request): Promise<SessionBootstrapResponse> {
    const { sessionCookieName, refreshCookieName } =
      this.sessionService.getCookieNames();
    const rawSid = readSessionCookie(req, sessionCookieName);
    const rawRefresh = readSessionCookie(req, refreshCookieName);
    return this.authService.getSessionBootstrap(rawSid, rawRefresh);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponse> {
    const { sessionCookieName, refreshCookieName } =
      this.sessionService.getCookieNames();
    const rawSid = readSessionCookie(req, sessionCookieName);
    const rawRefresh = readSessionCookie(req, refreshCookieName);
    const result = await this.authService.refresh(rawRefresh, rawSid);
    writeAuthCookies(
      res,
      this.sessionService,
      result.sessionSid,
      result.refreshToken,
    );
    return result.session;
  }

  @Public()
  @AllowMfaPending()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const { sessionCookieName, refreshCookieName } =
      this.sessionService.getCookieNames();
    const rawSid = readSessionCookie(req, sessionCookieName);
    const rawRefresh = readSessionCookie(req, refreshCookieName);

    await this.authService.logout(rawSid, rawRefresh);
    clearAuthCookies(res, this.sessionService);
  }

  @Public()
  @AllowMfaPending()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verifyEmail(
    @Body(new ZodValidationPipe(VerifyEmailOtpSchema))
    body: VerifyEmailOtpInput,
    @Req() req: RequestWithTrace,
  ): Promise<GenericMessageResponse> {
    const result = await this.authService.verifyEmailOtp(
      body,
      req.traceId ?? null,
    );
    return GenericMessageResponseSchema.parse(result);
  }

  @Public()
  @AllowMfaPending()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  async resendVerification(
    @Body(new ZodValidationPipe(ResendEmailOtpSchema))
    body: ResendEmailOtpInput,
    @Req() req: RequestWithTrace,
  ): Promise<GenericMessageResponse> {
    const result = await this.authService.resendVerificationOtp(
      body,
      req.traceId ?? null,
    );
    return GenericMessageResponseSchema.parse(result);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordSchema))
    body: ForgotPasswordInput,
    @Req() req: RequestWithTrace,
  ): Promise<GenericMessageResponse> {
    const result = await this.authService.forgotPassword(
      body,
      req.traceId ?? null,
    );
    return GenericMessageResponseSchema.parse(result);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordOtpSchema))
    body: ResetPasswordOtpInput,
    @Req() req: RequestWithTrace,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GenericMessageResponse> {
    const result = await this.authService.resetPasswordWithOtp(
      body,
      req.traceId ?? null,
    );
    clearAuthCookies(res, this.sessionService);
    return GenericMessageResponseSchema.parse(result);
  }

  @Get('me')
  me(@CurrentTrainer() trainer: AuthenticatedTrainer): Promise<TrainerProfile> {
    return this.authService.getMe(trainer.trainerId);
  }

  @Get('me/export')
  exportMyData(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
  ): Promise<TrainerDataExport> {
    return this.authService.exportTrainerData(trainer.trainerId);
  }

  @Get('sessions')
  getActiveSessions(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
  ): Promise<ActiveSessionsResponse> {
    return this.authService.listActiveSessions(
      trainer.trainerId,
      trainer.familyId,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('sessions/revoke-others')
  revokeOtherSessions(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
  ): Promise<RevokeOtherSessionsResponse> {
    return this.authService.revokeOtherSessions(
      trainer.trainerId,
      trainer.familyId,
    );
  }
}
