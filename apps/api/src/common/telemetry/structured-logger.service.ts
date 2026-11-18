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
      traceId: trace && trace.length === 32 ? trace : null,
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
    const payload: StructuredLogPayload = {
      timestamp: new Date().toISOString(),
      level,
      service_name: this.serviceName,
      trace_id: meta?.traceId ?? null,
      span_id: meta?.spanId ?? null,
      error_code: meta?.errorCode ?? null,
      message: typeof message === 'string' ? message : JSON.stringify(message),
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
