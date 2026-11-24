import type { ConfigService } from '@nestjs/config';
import type { ApiEnvConfig } from '../../config/env.schema';
import { SentryErrorReporterService } from './sentry-error-reporter.service';
import { StructuredLoggerService } from './structured-logger.service';

jest.mock('../http/safe-outbound-http', () => ({
  assertSafeOutboundUrl: jest.fn((rawUrl: string) =>
    Promise.resolve(new URL(rawUrl)),
  ),
}));

function createSentryConfigMock(
  dsn: string,
): ConfigService<ApiEnvConfig, true> {
  const values: Record<string, string> = {
    SENTRY_DSN: dsn,
    SENTRY_ENVIRONMENT: 'production',
    SENTRY_RELEASE: 'pokeverse@1.0.0',
  };
  return {
    get: (key: keyof ApiEnvConfig) => values[key as string] ?? '',
  } as unknown as ConfigService<ApiEnvConfig, true>;
}

describe('SentryErrorReporterService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stays disabled when SENTRY_DSN is empty or non-sentry host', async () => {
    const emptyReporter = new SentryErrorReporterService(
      createSentryConfigMock(''),
      new StructuredLoggerService(),
    );
    expect(emptyReporter.isEnabled()).toBe(false);
    await expect(
      emptyReporter.captureException({
        source: 'api',
        exception: new Error('boom'),
        errorCode: 'INTERNAL_SERVER_ERROR',
        route: '/api/v1/pokedex/slots',
      }),
    ).resolves.toBe(false);

    const nonSentryHost = new SentryErrorReporterService(
      createSentryConfigMock('https://publickey@evil.example/99'),
      new StructuredLoggerService(),
    );
    expect(nonSentryHost.isEnabled()).toBe(false);
  });

  it('dispatches redacted Sentry Envelope v7 with W3C trace context', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true } as Response);

    const reporter = new SentryErrorReporterService(
      createSentryConfigMock('https://pubkeydemo@o123.ingest.sentry.io/456'),
      new StructuredLoggerService(),
    );
    expect(reporter.isEnabled()).toBe(true);

    const sent = await reporter.captureException({
      source: 'api',
      exception: new Error(
        'Failure for ash@kanto.example with Bearer secret-jwt-token',
      ),
      errorCode: 'INTERNAL_SERVER_ERROR',
      route: '/api/v1/auth/google/callback?code=secretcode',
      method: 'GET',
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
    });

    expect(sent).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe('https://o123.ingest.sentry.io/api/456/envelope/');
    const body = typeof init?.body === 'string' ? init.body : '';
    expect(body).not.toContain('ash@kanto.example');
    expect(body).not.toContain('secret-jwt-token');
    expect(body).not.toContain('secretcode');
    expect(body).toContain('[REDACTED_EMAIL]');
    expect(body).toContain('Bearer [REDACTED]');
    expect(body).toContain('"trace_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"');
  });
});
