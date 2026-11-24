import type { ConfigService } from '@nestjs/config';
import type { ApiEnvConfig } from '../../config/env.schema';
import { OpenTelemetryService } from './opentelemetry.service';

function createOtelConfigMock(): ConfigService<ApiEnvConfig, true> {
  const values: Record<string, unknown> = {
    OTEL_SERVICE_NAME: 'pokeverse-api',
    OTEL_ENABLED: false,
    NODE_ENV: 'test',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
  };
  return {
    get: (key: keyof ApiEnvConfig) => values[key],
  } as unknown as ConfigService<ApiEnvConfig, true>;
}

describe('OpenTelemetryService', () => {
  it('computes RED metrics, cache hit ratio, database, kafka and ws gauges accurately', async () => {
    const service = new OpenTelemetryService(createOtelConfigMock());
    service.onModuleInit();

    for (const ms of [10, 20, 30, 40, 100]) {
      service.recordHttpRequest('GET', '/api/v1/pokedex/pokemon', 200, ms);
    }
    service.recordHttpRequest('POST', '/api/v1/auth/login', 503, 200);

    service.recordCacheOutcome('hit');
    service.recordCacheOutcome('hit');
    service.recordCacheOutcome('miss');
    service.recordCacheOutcome('stale-fallback');

    service.recordDatabaseQuery('Trainer', 12);
    service.recordDatabaseQuery('PokedexSlot', 48);

    service.recordKafkaPublish('pokeverse.world.events.v1', false);
    service.recordKafkaPublish('pokeverse.dlq.v1', true);

    service.recordWsConnectionDelta(1);
    service.recordWsConnectionDelta(1);
    service.recordWsConnectionDelta(-1);
    service.recordWsBroadcast('pokemon.saved', 'a'.repeat(32));

    const spanValue = await service.withSpan(
      'test.operation',
      { 'test.flag': true },
      () => Promise.resolve(42),
    );
    expect(spanValue).toBe(42);

    const snapshot = service.getSnapshot();
    expect(snapshot.service).toBe('pokeverse-api');
    expect(snapshot.otelSdkActive).toBe(false);
    expect(snapshot.http.totalRequests).toBe(6);
    expect(snapshot.http.error5xxCount).toBe(1);
    expect(snapshot.http.errorRate5xx).toBeCloseTo(1 / 6, 3);
    expect(snapshot.http.latencyMs.p50).toBe(30);
    expect(snapshot.http.latencyMs.p95).toBe(200);
    expect(snapshot.redisCache).toEqual({
      hits: 2,
      misses: 1,
      staleFallbacks: 1,
      hitRatio: 0.5,
    });
    expect(snapshot.database).toEqual({
      queryCount: 2,
      p95DurationMs: 48,
    });
    expect(snapshot.messaging).toEqual({
      publishedCount: 1,
      dlqCount: 1,
    });
    expect(snapshot.websocket).toEqual({
      activeConnections: 1,
      broadcastCount: 1,
    });

    await service.onModuleDestroy();
  });

  it('records exception state and rethrows inside withSpan', async () => {
    const service = new OpenTelemetryService(createOtelConfigMock());
    await expect(
      service.withSpan('failing.span', {}, () =>
        Promise.reject(new Error('upstream down')),
      ),
    ).rejects.toThrow('upstream down');
  });
});
