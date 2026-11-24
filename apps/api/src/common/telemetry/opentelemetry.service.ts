import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type Counter,
  type Histogram,
  type Meter,
  SpanStatusCode,
  type Tracer,
  type UpDownCounter,
  metrics,
  trace,
} from '@opentelemetry/api';
import {
  type TelemetrySnapshot,
  TelemetrySnapshotSchema,
} from '@pokeverse/shared';
import type { ApiEnvConfig } from '../../config/env.schema';
import {
  type OtelSdkBootstrapHandle,
  startOtelNodeSdk,
} from './otel-sdk.bootstrap';
import type {
  CacheMetricOutcome,
  TelemetryMetricsPort,
} from './telemetry.port';

const MAX_LATENCY_SAMPLES = 512;

function pushSample(buffer: number[], value: number): void {
  const normalized = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (buffer.length >= MAX_LATENCY_SAMPLES) {
    buffer.shift();
  }
  buffer.push(normalized);
}

function computePercentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) {
    return 0;
  }
  const sorted = samples.slice().sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return Number((sorted[idx] ?? 0).toFixed(2));
}

@Injectable()
export class OpenTelemetryService
  implements TelemetryMetricsPort, OnModuleInit, OnModuleDestroy
{
  private readonly serviceName: string;
  private readonly otelEnabled: boolean;
  private readonly isTestEnv: boolean;
  private readonly otlpEndpoint: string;
  private readonly tracer: Tracer;
  private readonly meter: Meter;
  private readonly httpDurationHistogram: Histogram;
  private readonly httpErrorCounter: Counter;
  private readonly cacheOutcomeCounter: Counter;
  private readonly dbDurationHistogram: Histogram;
  private readonly kafkaPublishCounter: Counter;
  private readonly wsConnectionsGauge: UpDownCounter;
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
  private kafkaDlqCount = 0;
  private wsActiveConnections = 0;
  private wsBroadcastCount = 0;

  constructor(config: ConfigService<ApiEnvConfig, true>) {
    this.serviceName = config.get('OTEL_SERVICE_NAME', { infer: true });
    this.otelEnabled = config.get('OTEL_ENABLED', { infer: true });
    this.isTestEnv = config.get('NODE_ENV', { infer: true }) === 'test';
    this.otlpEndpoint = config.get('OTEL_EXPORTER_OTLP_ENDPOINT', {
      infer: true,
    });

    this.tracer = trace.getTracer(this.serviceName);
    this.meter = metrics.getMeter(this.serviceName);
    this.httpDurationHistogram = this.meter.createHistogram(
      'http.server.request.duration',
      { unit: 'ms' },
    );
    this.httpErrorCounter = this.meter.createCounter('http.server.errors_5xx');
    this.cacheOutcomeCounter = this.meter.createCounter(
      'cache.pokeapi.outcomes',
    );
    this.dbDurationHistogram = this.meter.createHistogram(
      'db.prisma.query.duration',
      { unit: 'ms' },
    );
    this.kafkaPublishCounter = this.meter.createCounter(
      'messaging.kafka.published',
    );
    this.wsConnectionsGauge = this.meter.createUpDownCounter(
      'ws.world.active_connections',
    );
  }

  onModuleInit(): void {
    this.sdkHandle = startOtelNodeSdk({
      enabled: this.otelEnabled,
      isTestEnv: this.isTestEnv,
      serviceName: this.serviceName,
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
    pushSample(this.httpLatenciesMs, durationMs);
    this.httpDurationHistogram.record(durationMs, {
      'http.request.method': method,
      'http.route': routeGroup,
      'http.response.status_code': statusCode,
    });
    if (statusCode >= 500) {
      this.error5xxCount += 1;
      this.httpErrorCounter.add(1, {
        'http.request.method': method,
        'http.route': routeGroup,
      });
    }
  }

  recordCacheOutcome(outcome: CacheMetricOutcome): void {
    if (outcome === 'hit') this.cacheHits += 1;
    else if (outcome === 'miss') this.cacheMisses += 1;
    else this.cacheStaleFallbacks += 1;
    this.cacheOutcomeCounter.add(1, { outcome });
  }

  recordDatabaseQuery(target: string, durationMs: number): void {
    this.dbQueryCount += 1;
    pushSample(this.dbLatenciesMs, durationMs);
    this.dbDurationHistogram.record(durationMs, { 'db.target': target });
  }

  recordKafkaPublish(topic: string, isDlq: boolean): void {
    if (isDlq) this.kafkaDlqCount += 1;
    else this.kafkaPublishedCount += 1;
    this.kafkaPublishCounter.add(1, {
      'messaging.destination.name': topic,
      dlq: isDlq,
    });
  }

  recordWsConnectionDelta(delta: 1 | -1): void {
    this.wsActiveConnections = Math.max(0, this.wsActiveConnections + delta);
    this.wsConnectionsGauge.add(delta);
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
          p50: computePercentile(this.httpLatenciesMs, 50),
          p95: computePercentile(this.httpLatenciesMs, 95),
          p99: computePercentile(this.httpLatenciesMs, 99),
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
        p95DurationMs: computePercentile(this.dbLatenciesMs, 95),
      },
      messaging: {
        publishedCount: this.kafkaPublishedCount,
        dlqCount: this.kafkaDlqCount,
      },
      websocket: {
        activeConnections: this.wsActiveConnections,
        broadcastCount: this.wsBroadcastCount,
      },
    });
  }
}
