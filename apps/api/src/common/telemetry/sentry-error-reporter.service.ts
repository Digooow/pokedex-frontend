import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvConfig } from '../../config/env.schema';
import { assertSafeOutboundUrl } from '../http/safe-outbound-http';
import type {
  CaptureExceptionInput,
  ErrorReporterPort,
} from './error-reporter.port';
import {
  redactSensitiveText,
  StructuredLoggerService,
} from './structured-logger.service';

interface ParsedSentryDsn {
  readonly publicKey: string;
  readonly host: string;
  readonly envelopeUrl: string;
}

const SENTRY_TIMEOUT_MS = 3_000;
const MAX_STACK_FRAMES = 25;

function parseSentryDsn(rawDsn: string): ParsedSentryDsn | null {
  const trimmed = rawDsn.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    const projectId = parsed.pathname.replace(/^\/+/, '');
    const host = parsed.hostname.toLowerCase();
    const isSentryHost = host === 'sentry.io' || host.endsWith('.sentry.io');
    if (
      parsed.protocol !== 'https:' ||
      !parsed.username ||
      !/^\d+$/.test(projectId) ||
      !isSentryHost
    ) {
      return null;
    }
    return {
      publicKey: parsed.username,
      host,
      envelopeUrl: `https://${host}/api/${projectId}/envelope/`,
    };
  } catch {
    return null;
  }
}

function extractExceptionDetails(exception: unknown): {
  readonly type: string;
  readonly value: string;
  readonly stack: string | null;
} {
  if (exception instanceof Error) {
    const rawStack = exception.stack
      ? exception.stack
          .split('\n')
          .slice(0, MAX_STACK_FRAMES)
          .map((line) => redactSensitiveText(line))
          .join('\n')
      : null;
    return {
      type: exception.name || 'Error',
      value: redactSensitiveText(exception.message || 'Unhandled error'),
      stack: rawStack,
    };
  }
  return {
    type: 'UnhandledException',
    value: redactSensitiveText(
      typeof exception === 'string'
        ? exception
        : (JSON.stringify(exception) ?? 'Unknown error'),
    ),
    stack: null,
  };
}

@Injectable()
export class SentryErrorReporterService implements ErrorReporterPort {
  private readonly parsedDsn: ParsedSentryDsn | null;
  private readonly environment: string;
  private readonly release: string;

  constructor(
    config: ConfigService<ApiEnvConfig, true>,
    private readonly logger: StructuredLoggerService,
  ) {
    this.parsedDsn = parseSentryDsn(
      config.get('SENTRY_DSN', { infer: true }) ?? '',
    );
    this.environment =
      config.get('SENTRY_ENVIRONMENT', { infer: true }) ?? 'development';
    this.release =
      config.get('SENTRY_RELEASE', { infer: true }) ?? 'pokeverse@0.1.0';
  }

  isEnabled(): boolean {
    return this.parsedDsn !== null;
  }

  async captureException(input: CaptureExceptionInput): Promise<boolean> {
    if (!this.parsedDsn) {
      return false;
    }

    const eventId = randomBytes(16).toString('hex');
    const envelopeBody = this.buildEnvelopeBody(eventId, input);
    const authHeader =
      `Sentry sentry_version=7, sentry_client=pokeverse-otel-bridge/1.0, ` +
      `sentry_key=${this.parsedDsn.publicKey}`;

    try {
      const targetUrl = await assertSafeOutboundUrl(
        this.parsedDsn.envelopeUrl,
        [this.parsedDsn.host],
      );
      const response = await fetch(targetUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
          'X-Sentry-Auth': authHeader,
        },
        body: envelopeBody,
        redirect: 'error',
        signal: AbortSignal.timeout(SENTRY_TIMEOUT_MS),
      });
      return response.ok;
    } catch (error) {
      this.logger.emitEvent(
        'warn',
        `Sentry envelope dispatch skipped: ${String(error)}`,
        {
          context: SentryErrorReporterService.name,
          errorCode: 'SENTRY_DISPATCH_WARN',
          traceId: input.traceId ?? null,
          spanId: input.spanId ?? null,
        },
      );
      return false;
    }
  }

  private buildEnvelopeBody(
    eventId: string,
    input: CaptureExceptionInput,
  ): string {
    const nowIso = new Date().toISOString();
    const details = extractExceptionDetails(input.exception);
    const eventPayload = {
      event_id: eventId,
      timestamp: nowIso,
      platform: input.source === 'web' ? 'javascript' : 'node',
      level: 'error',
      environment: this.environment,
      release: this.release,
      tags: {
        source: input.source,
        error_code: input.errorCode,
        route: redactSensitiveText(input.route),
        ...(input.method ? { method: input.method } : {}),
        ...input.tags,
      },
      exception: {
        values: [
          {
            type: details.type,
            value: details.value,
          },
        ],
      },
      ...(details.stack ? { extra: { stack: details.stack } } : {}),
      ...(input.traceId
        ? {
            contexts: {
              trace: {
                trace_id: input.traceId,
                ...(input.spanId ? { span_id: input.spanId } : {}),
              },
            },
          }
        : {}),
    };

    const envelopeHeader = JSON.stringify({
      event_id: eventId,
      sent_at: nowIso,
    });
    const itemHeader = JSON.stringify({ type: 'event' });
    return `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(eventPayload)}`;
  }
}
