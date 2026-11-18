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
import type { Request, Response } from 'express';
import {
  type AuthenticatedTrainer,
  CurrentTrainer,
} from '../../common/decorators/current-trainer.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { readSessionCookie } from '../../common/guards/session-auth.guard';
import type { RequestWithTrace } from '../../common/middleware/correlation.middleware';
import { GoogleOAuthService } from './google-oauth.service';
import {
  OAUTH_BIND_COOKIE,
  REFRESH_COOKIE_PATH,
  writeAuthCookies,
} from './session-cookies.util';
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
    const { sessionCookieName, secure } = this.sessionService.getCookieNames();
    const rawSid = readSessionCookie(req, sessionCookieName);
    const existingSession =
      await this.sessionService.getSessionByRawSid(rawSid);
    const linkTrainerId =
      existingSession?.state === 'AUTHENTICATED'
        ? existingSession.trainerId
        : null;

    const { authorizeUrl, bindCookieValue } =
      await this.googleOAuth.createAuthorizationRequest(linkTrainerId);

    res.cookie(OAUTH_BIND_COOKIE, bindCookieValue, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: REFRESH_COOKIE_PATH,
      maxAge: 300_000,
    });
    res.redirect(authorizeUrl);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('callback')
  async handleGoogleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Req() req: RequestWithTrace,
    @Res() res: Response,
  ): Promise<void> {
    const baseRedirect = this.googleOAuth.getFrontendRedirectBase();
    const { secure } = this.sessionService.getCookieNames();
    const bindCookie = readSessionCookie(req, OAUTH_BIND_COOKIE);

    res.clearCookie(OAUTH_BIND_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: REFRESH_COOKIE_PATH,
    });

    if (oauthError || !code || !state) {
      res.redirect(`${baseRedirect}/?authError=google_cancelled`);
      return;
    }

    try {
      const outcome = await this.googleOAuth.handleCallback({
        code,
        state,
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
