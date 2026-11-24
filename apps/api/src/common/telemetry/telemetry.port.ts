import type { ClientRumSample, TelemetrySnapshot } from '@pokeverse/shared';

export const TELEMETRY_METRICS_PORT = Symbol('TELEMETRY_METRICS_PORT');

export type CacheMetricOutcome = 'hit' | 'miss' | 'stale-fallback';
export type KafkaConsumeOutcome = 'processed' | 'duplicate' | 'dlq';
export type ErrorSource = 'api' | 'web';

export interface TelemetryMetricsPort {
  withSpan<T>(
    name: string,
    attributes: Record<string, string | number | boolean>,
    fn: () => Promise<T>,
  ): Promise<T>;
  recordHttpRequest(
    method: string,
    routeGroup: string,
    statusCode: number,
    durationMs: number,
  ): void;
  recordCacheOutcome(outcome: CacheMetricOutcome): void;
  recordDatabaseQuery(target: string, durationMs: number): void;
  recordKafkaPublish(topic: string, isDlq: boolean): void;
  recordKafkaConsume(
    topic: string,
    consumerGroup: string,
    outcome: KafkaConsumeOutcome,
    durationMs: number,
  ): void;
  recordWsConnectionDelta(delta: 1 | -1): void;
  recordWsBroadcast(eventType: string, traceId: string | null): void;
  recordRumSample(sample: ClientRumSample): void;
  recordUnhandledError(source: ErrorSource, errorCode: string): void;
  getSnapshot(): TelemetrySnapshot;
}
