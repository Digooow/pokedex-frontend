import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { ApiEnvConfig } from '../../config/env.schema';
import { StructuredLoggerService } from '../telemetry/structured-logger.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function readCookieRecord(req: Request): Record<string, unknown> {
  const cookies: unknown = req.cookies;
  if (typeof cookies === 'object' && cookies !== null) {
    return cookies as Record<string, unknown>;
  }
  return {};
}

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(
    config: ConfigService<ApiEnvConfig, true>,
    private readonly logger: StructuredLoggerService,
  ) {
    this.allowedOrigins = new Set(
      config
        .get('CORS_ORIGINS', { infer: true })
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      return true;
    }

    const secFetchSite = req.header('sec-fetch-site')?.trim().toLowerCase();
    if (
      secFetchSite &&
      secFetchSite !== 'same-origin' &&
      secFetchSite !== 'none'
    ) {
      this.rejectCsrf(req, `Blocked Sec-Fetch-Site=${secFetchSite}`);
    }

    const originHeader = req.header('origin')?.trim();
    if (originHeader) {
      if (!this.allowedOrigins.has(originHeader)) {
        this.rejectCsrf(
          req,
          `Blocked cross-origin header Origin=${originHeader}`,
        );
      }
      return true;
    }

    const refererHeader = req.header('referer')?.trim();
    if (refererHeader) {
      const refererOrigin = this.extractOrigin(refererHeader);
      if (!refererOrigin || !this.allowedOrigins.has(refererOrigin)) {
        this.rejectCsrf(req, 'Blocked untrusted Referer origin');
      }
      return true;
    }

    const cookies = readCookieRecord(req);
    const hasSessionCookies = Boolean(
      cookies['pokeverse_session'] ??
      cookies['__Host-pokeverse_session'] ??
      cookies['pokeverse_refresh'],
    );
    if (hasSessionCookies && secFetchSite !== 'same-origin') {
      this.rejectCsrf(
        req,
        'Blocked cookie-authenticated mutation missing Origin and Same-Origin Fetch Metadata',
      );
    }

    return true;
  }

  private extractOrigin(rawUrl: string): string | null {
    try {
      return new URL(rawUrl).origin;
    } catch {
      return null;
    }
  }

  private rejectCsrf(req: Request, reason: string): never {
    this.logger.emitEvent('warn', `${reason} on ${req.method} ${req.url}`, {
      context: CsrfOriginGuard.name,
      errorCode: 'CSRF_ORIGIN_BLOCKED',
    });
    throw new ForbiddenException(
      'Requisição bloqueada pela proteção CSRF de origem.',
    );
  }
}
