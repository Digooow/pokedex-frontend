import type { Response } from 'express';
import type { SessionService } from './session.service';

export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export function writeAuthCookies(
  res: Response,
  sessionService: SessionService,
  sessionSid: string,
  refreshToken: string | null,
): void {
  const { sessionCookieName, refreshCookieName, secure, sameSite, domain } =
    sessionService.getCookieNames();

  res.cookie(sessionCookieName, sessionSid, {
    httpOnly: true,
    sameSite,
    secure,
    path: '/',
    maxAge: sessionService.getSessionTtlSec() * 1000,
    ...(domain ? { domain } : {}),
  });

  if (refreshToken) {
    res.cookie(refreshCookieName, refreshToken, {
      httpOnly: true,
      sameSite,
      secure,
      path: REFRESH_COOKIE_PATH,
      maxAge: sessionService.getRefreshTtlDays() * 86_400_000,
      ...(domain ? { domain } : {}),
    });
  }
}

export function clearAuthCookies(
  res: Response,
  sessionService: SessionService,
): void {
  const { sessionCookieName, refreshCookieName, secure, sameSite, domain } =
    sessionService.getCookieNames();

  res.clearCookie(sessionCookieName, {
    httpOnly: true,
    sameSite,
    secure,
    path: '/',
    ...(domain ? { domain } : {}),
  });
  res.clearCookie(refreshCookieName, {
    httpOnly: true,
    sameSite,
    secure,
    path: REFRESH_COOKIE_PATH,
    ...(domain ? { domain } : {}),
  });
}
