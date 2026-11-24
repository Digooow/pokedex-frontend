import type { ErrorReporterPort } from '../../common/telemetry/error-reporter.port';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { TelemetryMetricsPort } from '../../common/telemetry/telemetry.port';
import { TelemetryIngestionService } from './telemetry-ingestion.service';

describe('TelemetryIngestionService', () => {
  it('records validated Web Vitals RUM samples and returns ingest ack', () => {
    const recordRumSample = jest.fn();
    const service = new TelemetryIngestionService(
      new StructuredLoggerService(),
      { recordRumSample } as unknown as TelemetryMetricsPort,
    );

    const ack = service.ingestRumBatch(
      {
        samples: [
          { name: 'LCP', value: 1420, route: '/pokedex', tier: 'ULTRA' },
          { name: 'INP', value: 48, route: '/pokedex', tier: 'ULTRA' },
        ],
        traceId: 'a'.repeat(32),
      },
      'b'.repeat(32),
    );

    expect(ack).toEqual({
      accepted: true,
      count: 2,
      correlationId: 'b'.repeat(32),
    });
    expect(recordRumSample).toHaveBeenCalledTimes(2);
  });

  it('forwards sanitized client UI crashes to metrics, logger, and Sentry ErrorReporterPort', () => {
    const recordUnhandledError = jest.fn();
    const captureException = jest.fn().mockResolvedValue(true);
    const errorReporter: ErrorReporterPort = {
      isEnabled: () => true,
      captureException,
    };
    const service = new TelemetryIngestionService(
      new StructuredLoggerService(),
      { recordUnhandledError } as unknown as TelemetryMetricsPort,
      errorReporter,
    );

    const ack = service.ingestClientError(
      {
        name: 'TypeError',
        message: 'Crash with ash@kanto.example',
        route: '/pokedex',
        tier: 'BALANCED',
        traceId: 'c'.repeat(32),
      },
      'd'.repeat(32),
      null,
    );

    expect(ack).toEqual({
      accepted: true,
      count: 1,
      correlationId: 'd'.repeat(32),
    });
    expect(recordUnhandledError).toHaveBeenCalledWith('web', 'CLIENT_UI_ERROR');
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'web',
        errorCode: 'CLIENT_UI_ERROR',
        route: '/pokedex',
        traceId: 'c'.repeat(32),
        tags: { hardware_tier: 'BALANCED' },
      }),
    );
  });
});
