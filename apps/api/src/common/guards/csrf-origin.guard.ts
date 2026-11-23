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
const UNSAFE_FORM_CONTENT_TYPES = new Set([
  'text/plain',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
]);
const SESSION_COOKIE_NAMES = [
  'pokeverse_session',
  '__Host-pokeverse_session',
  'pokeverse_refresh',
  '__Secure-pokeverse_refresh',
  '__Host-pokeverse_refresh',
  'pokeverse_oauth_bind',
  '__Secure-pokeverse_oauth_bind',
] as const;

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
    const denialReason = this.findDenialReason(req);
    if (denialReason !== null) {
      const safePath = req.path || req.url.split('?')[0] || '/';
      this.logger.emitEvent(
        'warn',
        `${denialReason} on ${req.method} ${safePath}`,
        {
          context: CsrfOriginGuard.name,
          errorCode: 'CSRF_ORIGIN_BLOCKED',
        },
      );
      throw new ForbiddenException(
        'Requisição bloqueada pela proteção CSRF de origem.',
      );
    }

    return true;
  }

  private findDenialReason(req: Request): string | null {
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      return null;
    }

    const unsafeContentType = this.findUnsafeContentTypeReason(req);
    if (unsafeContentType !== null) {
      return unsafeContentType;
    }

    const secFetchSite = req.header('sec-fetch-site')?.trim().toLowerCase();
    if (
      secFetchSite &&
      secFetchSite !== 'same-origin' &&
      secFetchSite !== 'none'
    ) {
      return `Blocked Sec-Fetch-Site=${secFetchSite}`;
    }

    const originOrReferer = this.findOriginOrRefererDenialReason(req);
    if (originOrReferer.matched) {
      return originOrReferer.denialReason;
    }

    if (this.hasSessionCookies(req) && secFetchSite !== 'same-origin') {
      return 'Blocked cookie-authenticated mutation missing Origin and Same-Origin Fetch Metadata';
    }

    return null;
  }

  private findUnsafeContentTypeReason(req: Request): string | null {
    const rawContentType = req.header('content-type')?.trim();
    if (!rawContentType) {
      return null;
    }

    const mediaType = rawContentType.split(';')[0]?.trim().toLowerCase() ?? '';
    return UNSAFE_FORM_CONTENT_TYPES.has(mediaType)
      ? `Blocked unsafe Content-Type=${mediaType}`
      : null;
  }

  private findOriginOrRefererDenialReason(
    req: Request,
  ):
    | { readonly matched: true; readonly denialReason: string | null }
    | { readonly matched: false } {
    const originHeader = req.header('origin')?.trim();
    if (originHeader) {
      return {
        matched: true,
        denialReason: this.allowedOrigins.has(originHeader)
          ? null
          : `Blocked cross-origin header Origin=${originHeader}`,
      };
    }

    const refererHeader = req.header('referer')?.trim();
    if (!refererHeader) {
      return { matched: false };
    }

    const refererOrigin = this.extractOrigin(refererHeader);
    return {
      matched: true,
      denialReason:
        !refererOrigin || !this.allowedOrigins.has(refererOrigin)
          ? 'Blocked untrusted Referer origin'
          : null,
    };
  }

  private hasSessionCookies(req: Request): boolean {
    const cookies = readCookieRecord(req);
    return SESSION_COOKIE_NAMES.some((name) => Boolean(cookies[name]));
  }

  private extractOrigin(rawUrl: string): string | null {
    try {
      return new URL(rawUrl).origin;
    } catch {
      return null;
    }
  }
}
