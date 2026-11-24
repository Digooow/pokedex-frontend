import {
  type ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { RequestWithTrace } from '../middleware/correlation.middleware';
import type { ErrorReporterPort } from '../telemetry/error-reporter.port';
import { StructuredLoggerService } from '../telemetry/structured-logger.service';
import type { TelemetryMetricsPort } from '../telemetry/telemetry.port';
import { GlobalExceptionFilter } from './global-exception.filter';

function createHostHarness(overrides?: Partial<RequestWithTrace>) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const req: RequestWithTrace = {
    method: 'POST',
    path: '/api/v1/auth/login',
    url: '/api/v1/auth/login?debug=1',
    correlationId: 'corr-123',
    traceId: 'a'.repeat(32),
    spanId: 'b'.repeat(16),
    ...overrides,
  } as RequestWithTrace;

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => req,
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('GlobalExceptionFilter', () => {
  it('handles body-parser 413, 400, 415 errors and HttpException array/string messages without reporting 5xx', () => {
    const recordUnhandledError = jest.fn();
    const captureException = jest.fn().mockResolvedValue(undefined);
    const filter = new GlobalExceptionFilter(
      new StructuredLoggerService(),
      { recordUnhandledError } as unknown as TelemetryMetricsPort,
      { captureException } as unknown as ErrorReporterPort,
    );

    const tooLarge = createHostHarness();
    filter.catch({ type: 'entity.too.large' }, tooLarge.host);
    expect(tooLarge.status).toHaveBeenCalledWith(413);
    expect(tooLarge.json).toHaveBeenCalledWith({
      code: 'HTTP_413',
      message: 'Payload excede o limite máximo permitido.',
      correlationId: 'corr-123',
    });

    const syntaxBad = createHostHarness();
    const syntaxErr = Object.assign(new SyntaxError('bad json'), {
      status: 400,
    });
    filter.catch(syntaxErr, syntaxBad.host);
    expect(syntaxBad.status).toHaveBeenCalledWith(400);

    const unsupported = createHostHarness();
    filter.catch({ statusCode: 415 }, unsupported.host);
    expect(unsupported.status).toHaveBeenCalledWith(415);

    const httpArray = createHostHarness();
    filter.catch(
      new BadRequestException({ message: ['email inválido', 'senha curta'] }),
      httpArray.host,
    );
    expect(httpArray.status).toHaveBeenCalledWith(400);
    expect(httpArray.json).toHaveBeenCalledWith({
      code: 'HTTP_400',
      message: 'email inválido; senha curta',
      correlationId: 'corr-123',
    });

    const httpStr = createHostHarness();
    filter.catch(
      new HttpException('Recurso bloqueado', HttpStatus.FORBIDDEN),
      httpStr.host,
    );
    expect(httpStr.status).toHaveBeenCalledWith(403);
    expect(recordUnhandledError).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('masks internal errors as 500 without leaking stack traces and forwards to telemetry + error reporter', () => {
    const recordUnhandledError = jest.fn();
    const captureException = jest.fn().mockResolvedValue(undefined);
    const filter = new GlobalExceptionFilter(
      new StructuredLoggerService(),
      { recordUnhandledError } as unknown as TelemetryMetricsPort,
      { captureException } as unknown as ErrorReporterPort,
    );

    const harness = createHostHarness();
    const secretCrash = new Error(
      'FATAL: postgres://user:supersecret@db:5432/prod',
    );
    filter.catch(secretCrash, harness.host);

    expect(harness.status).toHaveBeenCalledWith(500);
    expect(harness.json).toHaveBeenCalledWith({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Erro interno inesperado ao processar a requisição.',
      correlationId: 'corr-123',
    });
    expect(recordUnhandledError).toHaveBeenCalledWith(
      'api',
      'INTERNAL_SERVER_ERROR',
    );
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'api',
        errorCode: 'INTERNAL_SERVER_ERROR',
        route: '/api/v1/auth/login',
        method: 'POST',
      }),
    );
  });
});
