import type { Response } from 'express';
import type { SessionService } from './session.service';

export const REFRESH_COOKIE_PATH = '/api/v1/auth';
export const OAUTH_BIND_COOKIE = 'pokeverse_oauth_bind';

export function writeAuthCookies(
  res: Response,
  sessionService: SessionService,
  sessionSid: string,
  refreshToken: string | null,
): void {
  const { sessionCookieName, refreshCookieName, secure } =
    sessionService.getCookieNames();

  res.cookie(sessionCookieName, sessionSid, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: sessionService.getSessionTtlSec() * 1000,
  });

  if (refreshToken) {
    res.cookie(refreshCookieName, refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: REFRESH_COOKIE_PATH,
      maxAge: sessionService.getRefreshTtlDays() * 86_400_000,
    });
  }
}

export function clearAuthCookies(
  res: Response,
  sessionService: SessionService,
): void {
  const { sessionCookieName, refreshCookieName, secure } =
    sessionService.getCookieNames();

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
