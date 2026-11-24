import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SpanStatusCode,
  type Tracer,
  metrics,
  trace,
} from '@opentelemetry/api';
import {
  type ClientRumSample,
  type TelemetrySnapshot,
  TelemetrySnapshotSchema,
} from '@pokeverse/shared';
import type { ApiEnvConfig } from '../../config/env.schema';
import {
  ERROR_REPORTER_PORT,
  type ErrorReporterPort,
} from './error-reporter.port';
import {
  type OtelInstruments,
  computeLatencyPercentile,
  createOtelInstruments,
  pushLatencySample,
} from './otel-instruments.util';
import {
  type OtelSdkBootstrapHandle,
  startOtelNodeSdk,
} from './otel-sdk.bootstrap';
import type {
  CacheMetricOutcome,
  ErrorSource,
  KafkaConsumeOutcome,
  TelemetryMetricsPort,
} from './telemetry.port';

@Injectable()
export class OpenTelemetryService
  implements TelemetryMetricsPort, OnModuleInit, OnModuleDestroy
{
  private readonly serviceName: string;
  private readonly serviceVersion: string;
  private readonly environment: string;
  private readonly otelEnabled: boolean;
  private readonly isTestEnv: boolean;
  private readonly otlpEndpoint: string;
  private readonly tracer: Tracer;
  private readonly instruments: OtelInstruments;
  private sdkHandle: OtelSdkBootstrapHandle | null = null;

  private readonly httpLatenciesMs: number[] = [];
  private readonly dbLatenciesMs: number[] = [];
  private totalHttpRequests = 0;
  private error5xxCount = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private cacheStaleFallbacks = 0;
  private dbQueryCount = 0;
  private kafkaPublishedCount = 0;
  private kafkaConsumedCount = 0;
  private kafkaDlqCount = 0;
  private wsActiveConnections = 0;
  private wsBroadcastCount = 0;
  private unhandledApiErrors = 0;
  private clientUiErrors = 0;
  private rumSamplesCount = 0;

  constructor(
    config: ConfigService<ApiEnvConfig, true>,
    @Optional()
    @Inject(ERROR_REPORTER_PORT)
    private readonly errorReporter?: ErrorReporterPort,
  ) {
    this.serviceName = config.get('OTEL_SERVICE_NAME', { infer: true });
    this.serviceVersion =
      config.get('OTEL_SERVICE_VERSION', { infer: true }) ?? '0.1.0';
    this.environment = config.get('NODE_ENV', { infer: true });
    this.otelEnabled = config.get('OTEL_ENABLED', { infer: true });
    this.isTestEnv = this.environment === 'test';
    this.otlpEndpoint = config.get('OTEL_EXPORTER_OTLP_ENDPOINT', {
      infer: true,
    });

    this.tracer = trace.getTracer(this.serviceName);
    this.instruments = createOtelInstruments(
      metrics.getMeter(this.serviceName),
    );
  }

  onModuleInit(): void {
    this.sdkHandle = startOtelNodeSdk({
      enabled: this.otelEnabled,
      isTestEnv: this.isTestEnv,
      serviceName: this.serviceName,
      serviceVersion: this.serviceVersion,
      environment: this.environment,
      otlpEndpoint: this.otlpEndpoint,
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sdkHandle) {
      await this.sdkHandle.shutdown().catch(() => undefined);
      this.sdkHandle = null;
    }
  }

  withSpan<T>(
    name: string,
    attributes: Record<string, string | number | boolean>,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.tracer.startActiveSpan(name, { attributes }, async (span) => {
      try {
        const result = await fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Span failure',
        });
        if (error instanceof Error) {
          span.recordException(error);
        }
        throw error;
      } finally {
        span.end();
      }
    });
  }

  recordHttpRequest(
    method: string,
    routeGroup: string,
    statusCode: number,
    durationMs: number,
  ): void {
    this.totalHttpRequests += 1;
    pushLatencySample(this.httpLatenciesMs, durationMs);
    this.instruments.httpDurationHistogram.record(durationMs, {
      'http.request.method': method,
      'http.route': routeGroup,
      'http.response.status_code': statusCode,
    });
    if (statusCode >= 500) {
      this.error5xxCount += 1;
      this.instruments.httpErrorCounter.add(1, {
        'http.request.method': method,
        'http.route': routeGroup,
      });
    }
  }

  recordCacheOutcome(outcome: CacheMetricOutcome): void {
    if (outcome === 'hit') this.cacheHits += 1;
    else if (outcome === 'miss') this.cacheMisses += 1;
    else this.cacheStaleFallbacks += 1;
    this.instruments.cacheOutcomeCounter.add(1, { outcome });
  }

  recordDatabaseQuery(target: string, durationMs: number): void {
    this.dbQueryCount += 1;
    pushLatencySample(this.dbLatenciesMs, durationMs);
    this.instruments.dbDurationHistogram.record(durationMs, {
      'db.target': target,
    });
  }

  recordKafkaPublish(topic: string, isDlq: boolean): void {
    if (isDlq) this.kafkaDlqCount += 1;
    else this.kafkaPublishedCount += 1;
    this.instruments.kafkaPublishCounter.add(1, {
      'messaging.destination.name': topic,
      dlq: isDlq,
    });
  }

  recordKafkaConsume(
    topic: string,
    consumerGroup: string,
    outcome: KafkaConsumeOutcome,
    durationMs: number,
  ): void {
    this.kafkaConsumedCount += 1;
    this.instruments.kafkaConsumeCounter.add(1, {
      'messaging.destination.name': topic,
      'messaging.consumer.group.name': consumerGroup,
      outcome,
    });
    this.instruments.kafkaConsumeDurationHistogram.record(durationMs, {
      'messaging.destination.name': topic,
      outcome,
    });
  }

  recordWsConnectionDelta(delta: 1 | -1): void {
    this.wsActiveConnections = Math.max(0, this.wsActiveConnections + delta);
    this.instruments.wsConnectionsGauge.add(delta);
  }

  recordWsBroadcast(eventType: string, traceId: string | null): void {
    this.wsBroadcastCount += 1;
    const span = this.tracer.startSpan('ws.world.broadcast', {
      attributes: {
        'ws.event_type': eventType,
        ...(traceId ? { 'trace.correlation_id': traceId } : {}),
      },
    });
    span.end();
  }

  recordRumSample(sample: ClientRumSample): void {
    this.rumSamplesCount += 1;
    this.instruments.webVitalsHistogram.record(sample.value, {
      'metric.name': sample.name,
      'http.route': sample.route,
      'hardware.tier': sample.tier,
    });
  }

  recordUnhandledError(source: ErrorSource, errorCode: string): void {
    if (source === 'api') {
      this.unhandledApiErrors += 1;
    } else {
      this.clientUiErrors += 1;
      this.instruments.clientUiErrorsCounter.add(1, { error_code: errorCode });
    }
    this.instruments.unhandledErrorsCounter.add(1, {
      source,
      error_code: errorCode,
    });
  }

  getSnapshot(): TelemetrySnapshot {
    const cacheTotal =
      this.cacheHits + this.cacheMisses + this.cacheStaleFallbacks;
    const hitRatio =
      cacheTotal > 0 ? Number((this.cacheHits / cacheTotal).toFixed(4)) : 0;
    const errorRate5xx =
      this.totalHttpRequests > 0
        ? Number((this.error5xxCount / this.totalHttpRequests).toFixed(4))
        : 0;

    return TelemetrySnapshotSchema.parse({
      service: 'pokeverse-api',
      otelSdkActive: this.sdkHandle?.active ?? false,
      generatedAt: new Date().toISOString(),
      http: {
        totalRequests: this.totalHttpRequests,
        error5xxCount: this.error5xxCount,
        errorRate5xx,
        latencyMs: {
          p50: computeLatencyPercentile(this.httpLatenciesMs, 50),
          p95: computeLatencyPercentile(this.httpLatenciesMs, 95),
          p99: computeLatencyPercentile(this.httpLatenciesMs, 99),
        },
      },
      redisCache: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        staleFallbacks: this.cacheStaleFallbacks,
        hitRatio,
      },
      database: {
        queryCount: this.dbQueryCount,
        p95DurationMs: computeLatencyPercentile(this.dbLatenciesMs, 95),
      },
      messaging: {
        publishedCount: this.kafkaPublishedCount,
        consumedCount: this.kafkaConsumedCount,
        dlqCount: this.kafkaDlqCount,
      },
      websocket: {
        activeConnections: this.wsActiveConnections,
        broadcastCount: this.wsBroadcastCount,
      },
      observability: {
        otelLogsActive: this.sdkHandle?.logsActive ?? false,
        sentryEnabled: this.errorReporter?.isEnabled() ?? false,
        unhandledApiErrors: this.unhandledApiErrors,
        clientUiErrors: this.clientUiErrors,
        rumSamplesCount: this.rumSamplesCount,
      },
    });
  }
}
