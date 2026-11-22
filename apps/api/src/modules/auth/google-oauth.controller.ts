import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type GoogleOAuthCallbackQuery,
  GoogleOAuthCallbackQuerySchema,
} from '@pokeverse/shared';
import type { Request, Response } from 'express';
import {
  type AuthenticatedTrainer,
  CurrentTrainer,
} from '../../common/decorators/current-trainer.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { readSessionCookie } from '../../common/guards/session-auth.guard';
import type { RequestWithTrace } from '../../common/middleware/correlation.middleware';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { GoogleOAuthService } from './google-oauth.service';
import { REFRESH_COOKIE_PATH, writeAuthCookies } from './session-cookies.util';
import { SessionService } from './session.service';

@Controller('auth/google')
export class GoogleOAuthController {
  constructor(
    private readonly googleOAuth: GoogleOAuthService,
    private readonly sessionService: SessionService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('start')
  async startGoogleAuth(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { sessionCookieName, oauthBindCookieName, secure, sameSite, domain } =
      this.sessionService.getCookieNames();
    const oauthSameSite = sameSite === 'strict' ? 'lax' : sameSite;
    const rawSid = readSessionCookie(req, sessionCookieName);
    const existingSession =
      await this.sessionService.getSessionByRawSid(rawSid);
    const linkTrainerId =
      existingSession?.state === 'AUTHENTICATED'
        ? existingSession.trainerId
        : null;

    const { authorizeUrl, bindCookieValue } =
      await this.googleOAuth.createAuthorizationRequest(linkTrainerId);

    res.cookie(oauthBindCookieName, bindCookieValue, {
      httpOnly: true,
      sameSite: oauthSameSite,
      secure,
      path: REFRESH_COOKIE_PATH,
      maxAge: 300_000,
      ...(domain ? { domain } : {}),
    });
    res.redirect(authorizeUrl);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('callback')
  async handleGoogleCallback(
    @Query(new ZodValidationPipe(GoogleOAuthCallbackQuerySchema))
    query: GoogleOAuthCallbackQuery,
    @Req() req: RequestWithTrace,
    @Res() res: Response,
  ): Promise<void> {
    const baseRedirect = this.googleOAuth.getFrontendRedirectBase();
    const { oauthBindCookieName, secure, sameSite, domain } =
      this.sessionService.getCookieNames();
    const oauthSameSite = sameSite === 'strict' ? 'lax' : sameSite;
    const bindCookie = readSessionCookie(req, oauthBindCookieName);

    res.clearCookie(oauthBindCookieName, {
      httpOnly: true,
      sameSite: oauthSameSite,
      secure,
      path: REFRESH_COOKIE_PATH,
      ...(domain ? { domain } : {}),
    });

    if (query.error || !query.code || !query.state) {
      res.redirect(`${baseRedirect}/?authError=google_cancelled`);
      return;
    }

    try {
      const outcome = await this.googleOAuth.handleCallback({
        code: query.code,
        state: query.state,
        bindCookieValue: bindCookie,
        traceId: req.traceId ?? null,
      });

      if (outcome.sessionSid) {
        writeAuthCookies(
          res,
          this.sessionService,
          outcome.sessionSid,
          outcome.refreshToken ?? null,
        );
      }

      res.redirect(outcome.redirectUrl);
    } catch {
      res.redirect(`${baseRedirect}/?authError=google_auth_failed`);
    }
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete()
  async unlinkGoogle(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
  ): Promise<void> {
    await this.googleOAuth.unlinkGoogle(trainer.trainerId);
  }
}
