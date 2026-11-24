import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  type ClientErrorReport,
  type ClientRumBatch,
  type TelemetryIngestAck,
  TelemetryIngestAckSchema,
} from '@pokeverse/shared';
import {
  ERROR_REPORTER_PORT,
  type ErrorReporterPort,
} from '../../common/telemetry/error-reporter.port';
import {
  redactSensitiveText,
  StructuredLoggerService,
} from '../../common/telemetry/structured-logger.service';
import {
  TELEMETRY_METRICS_PORT,
  type TelemetryMetricsPort,
} from '../../common/telemetry/telemetry.port';

@Injectable()
export class TelemetryIngestionService {
  constructor(
    private readonly logger: StructuredLoggerService,
    @Optional()
    @Inject(TELEMETRY_METRICS_PORT)
    private readonly telemetry?: TelemetryMetricsPort,
    @Optional()
    @Inject(ERROR_REPORTER_PORT)
    private readonly errorReporter?: ErrorReporterPort,
  ) {}

  ingestRumBatch(
    batch: ClientRumBatch,
    correlationId: string | null,
  ): TelemetryIngestAck {
    for (const sample of batch.samples) {
      this.telemetry?.recordRumSample(sample);
    }
    return TelemetryIngestAckSchema.parse({
      accepted: true,
      count: batch.samples.length,
      correlationId: correlationId ?? batch.traceId ?? null,
    });
  }

  ingestClientError(
    report: ClientErrorReport,
    correlationId: string | null,
    requestTraceId: string | null,
  ): TelemetryIngestAck {
    const resolvedTraceId = report.traceId ?? requestTraceId ?? null;
    const safeMessage = redactSensitiveText(report.message);
    const safeRoute = redactSensitiveText(report.route);
    const errorCode = 'CLIENT_UI_ERROR';

    this.telemetry?.recordUnhandledError('web', errorCode);
    this.logger.emitEvent(
      'error',
      `Client UI crash on ${safeRoute}: ${report.name}: ${safeMessage}`,
      {
        context: TelemetryIngestionService.name,
        errorCode,
        traceId: resolvedTraceId,
      },
    );

    const clientError = new Error(safeMessage);
    clientError.name = report.name;
    if (report.stack) {
      clientError.stack = redactSensitiveText(report.stack);
    }

    void this.errorReporter?.captureException({
      source: 'web',
      exception: clientError,
      errorCode,
      route: safeRoute,
      traceId: resolvedTraceId,
      tags: report.tier ? { hardware_tier: report.tier } : undefined,
    });

    return TelemetryIngestAckSchema.parse({
      accepted: true,
      count: 1,
      correlationId: correlationId ?? resolvedTraceId,
    });
  }
}
