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

interface BodyParserHttpErrorLike {
  readonly status?: unknown;
  readonly statusCode?: unknown;
  readonly type?: unknown;
}

const BODY_PARSER_BY_TYPE: Readonly<
  Record<string, { readonly status: number; readonly message: string }>
> = {
  'entity.too.large': {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    message: 'Payload excede o limite máximo permitido.',
  },
  'entity.parse.failed': {
    status: HttpStatus.BAD_REQUEST,
    message: 'Corpo JSON malformado.',
  },
  'encoding.unsupported': {
    status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    message: 'Tipo de conteúdo ou codificação não suportado.',
  },
};

function resolveBodyParserHttpError(
  exception: unknown,
): { readonly status: number; readonly message: string } | null {
  if (typeof exception !== 'object' || exception === null) {
    return null;
  }
  const candidate = exception as BodyParserHttpErrorLike;
  if (
    typeof candidate.type === 'string' &&
    Object.hasOwn(BODY_PARSER_BY_TYPE, candidate.type)
  ) {
    return BODY_PARSER_BY_TYPE[candidate.type] ?? null;
  }
  const rawStatus = candidate.status ?? candidate.statusCode;
  if (rawStatus === 413) {
    return BODY_PARSER_BY_TYPE['entity.too.large'] ?? null;
  }
  if (exception instanceof SyntaxError && rawStatus === 400) {
    return BODY_PARSER_BY_TYPE['entity.parse.failed'] ?? null;
  }
  if (rawStatus === 415) {
    return BODY_PARSER_BY_TYPE['encoding.unsupported'] ?? null;
  }
  return null;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestWithTrace>();

    const bodyParserError =
      exception instanceof HttpException
        ? null
        : resolveBodyParserHttpError(exception);

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (bodyParserError?.status ?? HttpStatus.INTERNAL_SERVER_ERROR);

    const errorCode =
      status >= 500 ? 'INTERNAL_SERVER_ERROR' : `HTTP_${status}`;

    const clientMessage =
      exception instanceof HttpException
        ? this.extractSafeHttpMessage(exception)
        : (bodyParserError?.message ??
          'Erro interno inesperado ao processar a requisição.');

    const safePath = req.path || req.url.split('?')[0] || '/';

    this.logger.emitEvent(
      status >= 500 ? 'error' : 'warn',
      `${req.method} ${safePath} -> ${status}`,
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
