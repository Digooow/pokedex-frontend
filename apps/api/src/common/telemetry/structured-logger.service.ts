import { Injectable, LoggerService } from '@nestjs/common';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface StructuredLogPayload {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly service_name: string;
  readonly trace_id: string | null;
  readonly span_id: string | null;
  readonly error_code: string | null;
  readonly message: string;
  readonly context?: string;
}

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|cookie|authorization|apikey|api_key|otp|codeverifier|privatekey)/i;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const PEM_KEY_PATTERN =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const AUTH_HEADER_PAIR_PATTERN =
  /\b(authorization|cookie|set-cookie)\s*[:=]\s*([^\s;,]+)/gi;
const SENSITIVE_QUERY_PATTERN =
  /([?&](?:code|state|token|access_token|id_token|refresh_token|password|secret|otp|otpCode|api_key|apikey)=)([^&#\s]+)/gi;
const MAX_LOG_DEPTH = 4;

export function redactSensitiveText(raw: string): string {
  return raw
    .replaceAll(PEM_KEY_PATTERN, '[REDACTED_PEM_KEY]')
    .replaceAll(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replaceAll(JWT_PATTERN, '[REDACTED_JWT]')
    .replaceAll(AUTH_HEADER_PAIR_PATTERN, '$1=[REDACTED]')
    .replaceAll(SENSITIVE_QUERY_PATTERN, '$1[REDACTED]')
    .replaceAll(EMAIL_PATTERN, '[REDACTED_EMAIL]');
}

export function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_LOG_DEPTH) {
    return '[TRUNCATED]';
  }
  if (typeof value === 'string') {
    return redactSensitiveText(value);
  }
  if (value instanceof Error) {
    return redactSensitiveText(value.message);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    sanitized[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? '[REDACTED]'
      : sanitizeLogValue(entryValue, depth + 1);
  }
  return sanitized;
}

@Injectable()
export class StructuredLoggerService implements LoggerService {
  private readonly serviceName = 'pokeverse-api';

  log(message: unknown, context?: string): void {
    this.emit('info', message, { context });
  }

  warn(message: unknown, context?: string): void {
    this.emit('warn', message, { context });
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.emit('error', message, {
      context,
      errorCode: 'INTERNAL_LOG_ERROR',
      traceId: trace?.length === 32 ? trace : null,
    });
  }

  debug(message: unknown, context?: string): void {
    this.emit('debug', message, { context });
  }

  emitEvent(
    level: LogLevel,
    message: string,
    meta?: {
      readonly context?: string;
      readonly errorCode?: string;
      readonly traceId?: string | null;
      readonly spanId?: string | null;
    },
  ): void {
    this.emit(level, message, meta);
  }

  private emit(
    level: LogLevel,
    message: unknown,
    meta?: {
      readonly context?: string;
      readonly errorCode?: string;
      readonly traceId?: string | null;
      readonly spanId?: string | null;
    },
  ): void {
    const sanitized = sanitizeLogValue(message);
    const serializedMessage =
      typeof sanitized === 'string'
        ? sanitized
        : (JSON.stringify(sanitized) ?? '');

    const payload: StructuredLogPayload = {
      timestamp: new Date().toISOString(),
      level,
      service_name: this.serviceName,
      trace_id: meta?.traceId ?? null,
      span_id: meta?.spanId ?? null,
      error_code: meta?.errorCode ?? null,
      message: serializedMessage,
      ...(meta?.context ? { context: meta.context } : {}),
    };

    const line = `${JSON.stringify(payload)}\n`;
    if (level === 'error') {
      process.stderr.write(line);
      return;
    }
    process.stdout.write(line);
  }
}
