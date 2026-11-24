import type { TelemetrySnapshot } from '@pokeverse/shared';

export const TELEMETRY_METRICS_PORT = Symbol('TELEMETRY_METRICS_PORT');

export type CacheMetricOutcome = 'hit' | 'miss' | 'stale-fallback';

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
  recordWsConnectionDelta(delta: 1 | -1): void;
  recordWsBroadcast(eventType: string, traceId: string | null): void;
  getSnapshot(): TelemetrySnapshot;
}
