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
  type SessionBootstrapResponse,
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
import { SessionService } from './session.service';

const REFRESH_COOKIE_PATH = '/api/v1/auth';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

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
    this.setSessionCookies(res, result.sessionSid, result.refreshToken);
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
    this.setSessionCookies(res, result.sessionSid, result.refreshToken);
    return result.session;
  }

  @Public()
  @AllowMfaPending()
  @Get('session')
  async getSession(@Req() req: Request): Promise<SessionBootstrapResponse> {
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
    this.setSessionCookies(res, result.sessionSid, result.refreshToken);
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
    this.clearSessionCookies(res);
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
    this.clearSessionCookies(res);
    return GenericMessageResponseSchema.parse(result);
  }

  @Get('me')
  async me(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
  ): Promise<TrainerProfile> {
    return this.authService.getMe(trainer.trainerId);
  }

  private setSessionCookies(
    res: Response,
    sessionSid: string,
    refreshToken: string | null,
  ): void {
    const { sessionCookieName, refreshCookieName, secure } =
      this.sessionService.getCookieNames();
    const sessionMaxAgeMs = this.sessionService.getSessionTtlSec() * 1000;
    const refreshMaxAgeMs =
      this.sessionService.getRefreshTtlDays() * 86_400_000;

    res.cookie(sessionCookieName, sessionSid, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: sessionMaxAgeMs,
    });

    if (refreshToken) {
      res.cookie(refreshCookieName, refreshToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: REFRESH_COOKIE_PATH,
        maxAge: refreshMaxAgeMs,
      });
    }
  }

  private clearSessionCookies(res: Response): void {
    const { sessionCookieName, refreshCookieName, secure } =
      this.sessionService.getCookieNames();

    res.clearCookie(sessionCookieName, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
    });
    res.clearCookie(refreshCookieName, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: REFRESH_COOKIE_PATH,
    });
  }
}
