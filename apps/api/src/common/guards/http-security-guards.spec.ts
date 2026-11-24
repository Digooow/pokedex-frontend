import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ApiEnvConfig } from '../../config/env.schema';
import type { SessionService } from '../../modules/auth/session.service';
import { ALLOW_MFA_PENDING_KEY } from '../decorators/allow-mfa-pending.decorator';
import type { RequestWithTrainer } from '../decorators/current-trainer.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { StructuredLoggerService } from '../telemetry/structured-logger.service';
import { CsrfOriginGuard } from './csrf-origin.guard';
import { SessionAuthGuard, readSessionCookie } from './session-auth.guard';
import { TrainerThrottlerGuard } from './trainer-throttler.guard';

function createHttpContext(req: unknown): ExecutionContext {
  const handler = () => undefined;
  class DummyController {}
  return {
    getHandler: () => handler,
    getClass: () => DummyController,
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('HTTP Security Guards (SessionAuthGuard, CsrfOriginGuard, TrainerThrottlerGuard)', () => {
  it('enforces @Public, cookie session, MFA_PENDING gate, and trainer projection in SessionAuthGuard', async () => {
    expect(
      readSessionCookie(
        { cookies: null } as unknown as RequestWithTrainer,
        's',
      ),
    ).toBe(undefined);
    expect(
      readSessionCookie(
        { cookies: { s: 'abc' } } as unknown as RequestWithTrainer,
        's',
      ),
    ).toBe('abc');

    let isPublic = true;
    let allowMfaPending = false;
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === IS_PUBLIC_KEY
          ? isPublic
          : key === ALLOW_MFA_PENDING_KEY
            ? allowMfaPending
            : false,
      ),
    } as unknown as Reflector;

    const getSessionByRawSid = jest.fn();
    const sessionService = {
      getCookieNames: () => ({ sessionCookieName: 'pokeverse_session' }),
      getSessionByRawSid,
    } as unknown as SessionService;

    const guard = new SessionAuthGuard(reflector, sessionService);
    const req: RequestWithTrainer = {
      cookies: { pokeverse_session: 'raw-sid' },
    } as unknown as RequestWithTrainer;

    expect(await guard.canActivate(createHttpContext(req))).toBe(true);
    expect(getSessionByRawSid).not.toHaveBeenCalled();

    isPublic = false;
    getSessionByRawSid.mockResolvedValueOnce(null);
    await expect(guard.canActivate(createHttpContext(req))).rejects.toThrow(
      UnauthorizedException,
    );

    getSessionByRawSid.mockResolvedValueOnce({
      trainerId: 'tr-1',
      username: 'Red',
      familyId: 'fam-1',
      sidHash: 'hash-1',
      state: 'MFA_PENDING',
    });
    await expect(guard.canActivate(createHttpContext(req))).rejects.toThrow(
      ForbiddenException,
    );

    allowMfaPending = true;
    getSessionByRawSid.mockResolvedValueOnce({
      trainerId: 'tr-1',
      username: 'Red',
      familyId: 'fam-1',
      sidHash: 'hash-1',
      state: 'MFA_PENDING',
    });
    expect(await guard.canActivate(createHttpContext(req))).toBe(true);
    expect(req.trainer).toEqual({
      trainerId: 'tr-1',
      username: 'Red',
      role: 'TRAINER',
      sessionState: 'MFA_PENDING',
      familyId: 'fam-1',
      sidHash: 'hash-1',
    });
  });

  it('blocks unsafe content types, cross-site fetch metadata, bad origins/referers, and cookie mutations without origin', () => {
    const config = {
      get: jest.fn(() => 'http://localhost:4200, https://pokeverse.pages.dev'),
    } as unknown as ConfigService<ApiEnvConfig, true>;
    const guard = new CsrfOriginGuard(config, new StructuredLoggerService());

    const makeReq = (params: {
      method: string;
      headers?: Record<string, string>;
      cookies?: Record<string, string>;
    }) => {
      const headers = params.headers ?? {};
      return {
        method: params.method,
        path: '/api/v1/pokedex/slots',
        url: '/api/v1/pokedex/slots',
        cookies: params.cookies ?? {},
        header: (name: string) => headers[name.toLowerCase()],
      } as unknown as Request;
    };

    expect(
      guard.canActivate(createHttpContext(makeReq({ method: 'GET' }))),
    ).toBe(true);
    expect(
      guard.canActivate(
        createHttpContext(
          makeReq({
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              origin: 'https://pokeverse.pages.dev',
            },
          }),
        ),
      ),
    ).toBe(true);
    expect(
      guard.canActivate(
        createHttpContext(
          makeReq({
            method: 'POST',
            headers: {
              referer: 'http://localhost:4200/pokedex?q=pikachu',
            },
          }),
        ),
      ),
    ).toBe(true);

    expect(() =>
      guard.canActivate(
        createHttpContext(
          makeReq({
            method: 'POST',
            headers: { 'content-type': 'multipart/form-data; boundary=123' },
          }),
        ),
      ),
    ).toThrow(ForbiddenException);

    expect(() =>
      guard.canActivate(
        createHttpContext(
          makeReq({
            method: 'PUT',
            headers: { 'sec-fetch-site': 'cross-site' },
          }),
        ),
      ),
    ).toThrow(ForbiddenException);

    expect(() =>
      guard.canActivate(
        createHttpContext(
          makeReq({
            method: 'DELETE',
            headers: { referer: 'not-a-valid-url' },
          }),
        ),
      ),
    ).toThrow(ForbiddenException);

    expect(() =>
      guard.canActivate(
        createHttpContext(
          makeReq({
            method: 'POST',
            cookies: { pokeverse_session: 'sid-1' },
          }),
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it('tracks rate-limit keys by trainerId for authenticated requests and by IP for visitors', async () => {
    const throttler = Object.create(
      TrainerThrottlerGuard.prototype,
    ) as TrainerThrottlerGuard & {
      getTracker(req: Record<string, unknown>): Promise<string>;
    };

    expect(
      await throttler.getTracker({
        trainer: { trainerId: 'trainer-42' },
        ip: '10.0.0.1',
      }),
    ).toBe('trainer:trainer-42');
    expect(await throttler.getTracker({ ip: '192.168.1.5' })).toBe(
      'ip:192.168.1.5',
    );
    expect(await throttler.getTracker({ ip: '' })).toBe('ip:unknown');
  });
});
