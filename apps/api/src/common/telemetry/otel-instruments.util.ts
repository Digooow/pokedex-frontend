import type {
  Counter,
  Histogram,
  Meter,
  UpDownCounter,
} from '@opentelemetry/api';

export interface OtelInstruments {
  readonly httpDurationHistogram: Histogram;
  readonly httpErrorCounter: Counter;
  readonly cacheOutcomeCounter: Counter;
  readonly dbDurationHistogram: Histogram;
  readonly kafkaPublishCounter: Counter;
  readonly kafkaConsumeCounter: Counter;
  readonly kafkaConsumeDurationHistogram: Histogram;
  readonly wsConnectionsGauge: UpDownCounter;
  readonly webVitalsHistogram: Histogram;
  readonly unhandledErrorsCounter: Counter;
  readonly clientUiErrorsCounter: Counter;
}

export function createOtelInstruments(meter: Meter): OtelInstruments {
  return {
    httpDurationHistogram: meter.createHistogram(
      'http.server.request.duration',
      { unit: 'ms' },
    ),
    httpErrorCounter: meter.createCounter('http.server.errors_5xx'),
    cacheOutcomeCounter: meter.createCounter('cache.pokeapi.outcomes'),
    dbDurationHistogram: meter.createHistogram('db.prisma.query.duration', {
      unit: 'ms',
    }),
    kafkaPublishCounter: meter.createCounter('messaging.kafka.published'),
    kafkaConsumeCounter: meter.createCounter('messaging.kafka.consumed'),
    kafkaConsumeDurationHistogram: meter.createHistogram(
      'messaging.kafka.consume.duration',
      { unit: 'ms' },
    ),
    wsConnectionsGauge: meter.createUpDownCounter(
      'ws.world.active_connections',
    ),
    webVitalsHistogram: meter.createHistogram('web.vitals.value', {
      unit: 'ms',
    }),
    unhandledErrorsCounter: meter.createCounter('app.unhandled_errors'),
    clientUiErrorsCounter: meter.createCounter('client.ui_errors'),
  };
}

export function pushLatencySample(buffer: number[], value: number): void {
  const normalized = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (buffer.length >= 512) {
    buffer.shift();
  }
  buffer.push(normalized);
}

export function computeLatencyPercentile(
  samples: readonly number[],
  p: number,
): number {
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
