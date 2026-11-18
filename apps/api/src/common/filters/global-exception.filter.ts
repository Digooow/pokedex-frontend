import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithTrace } from '../middleware/correlation.middleware';
import { StructuredLoggerService } from '../telemetry/structured-logger.service';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestWithTrace>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorCode =
      status >= 500 ? 'INTERNAL_SERVER_ERROR' : `HTTP_${status}`;

    const clientMessage =
      exception instanceof HttpException
        ? this.extractSafeHttpMessage(exception)
        : 'Erro interno inesperado ao processar a requisição.';

    this.logger.emitEvent(
      status >= 500 ? 'error' : 'warn',
      `${req.method} ${req.url} -> ${status}`,
      {
        context: GlobalExceptionFilter.name,
        errorCode,
        traceId: req.traceId ?? null,
        spanId: req.spanId ?? null,
      },
    );

    res.status(status).json({
      code: errorCode,
      message: clientMessage,
      correlationId: req.correlationId ?? null,
    });
  }

  private extractSafeHttpMessage(exception: HttpException): string {
    const body = exception.getResponse();
    if (typeof body === 'string') {
      return body;
    }
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const msg = (body as { message?: unknown }).message;
      if (typeof msg === 'string') {
        return msg;
      }
      if (Array.isArray(msg)) {
        return msg
          .filter((item): item is string => typeof item === 'string')
          .join('; ');
      }
    }
    return exception.message || 'Falha na requisição.';
  }
}
