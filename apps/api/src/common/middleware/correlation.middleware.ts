import { randomBytes } from 'node:crypto';
import { Inject, Injectable, NestMiddleware, Optional } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  TELEMETRY_METRICS_PORT,
  type TelemetryMetricsPort,
} from '../telemetry/telemetry.port';

export interface RequestWithTrace extends Request {
  correlationId?: string;
  traceId?: string;
  spanId?: string;
}

const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i;

function resolveRouteGroup(req: Request): string {
  const rawRoute: unknown = Reflect.get(req, 'route');
  if (typeof rawRoute === 'object' && rawRoute !== null) {
    const rawPath: unknown = Reflect.get(rawRoute, 'path');
    if (typeof rawPath === 'string' && rawPath.length > 0) {
      const baseUrl = typeof req.baseUrl === 'string' ? req.baseUrl : '';
      return `${baseUrl}${rawPath}`;
    }
  }
  return 'unmatched';
}

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  constructor(
    @Optional()
    @Inject(TELEMETRY_METRICS_PORT)
    private readonly telemetry?: TelemetryMetricsPort,
  ) {}

  use(req: RequestWithTrace, res: Response, next: NextFunction): void {
    const incomingTrace = req.header('traceparent');
    const matched = incomingTrace
      ? TRACEPARENT_PATTERN.exec(incomingTrace)
      : null;

    const traceId =
      matched?.[1]?.toLowerCase() ?? randomBytes(16).toString('hex');
    const spanId = randomBytes(8).toString('hex');
    const correlationId = req.header('x-correlation-id')?.trim() || traceId;

    req.traceId = traceId;
    req.spanId = spanId;
    req.correlationId = correlationId;

    res.setHeader('x-correlation-id', correlationId);
    res.setHeader('traceparent', `00-${traceId}-${spanId}-01`);

    if (this.telemetry) {
      const startedAt = performance.now();
      res.once('finish', () => {
        const durationMs = Math.max(0, performance.now() - startedAt);
        this.telemetry?.recordHttpRequest(
          req.method,
          resolveRouteGroup(req),
          res.statusCode,
          durationMs,
        );
      });
    }

    next();
  }
}
