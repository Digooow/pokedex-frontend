import { randomBytes } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export interface RequestWithTrace extends Request {
  correlationId?: string;
  traceId?: string;
  spanId?: string;
}

const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i;

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
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

    next();
  }
}
