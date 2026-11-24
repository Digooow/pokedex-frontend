import type { ConfigService } from '@nestjs/config';
import type { EachMessagePayload } from 'kafkajs';
import { z } from 'zod';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { TelemetryMetricsPort } from '../../common/telemetry/telemetry.port';
import type { ApiEnvConfig } from '../../config/env.schema';
import type { KafkaService } from '../../infra/kafka.service';
import type { RedisService } from '../../infra/redis.service';
import { BaseIdempotentKafkaConsumer } from './base-idempotent-kafka.consumer';

type MessageHandler = (payload: EachMessagePayload) => Promise<void>;

const TestEventSchema = z.object({
  eventId: z.uuid(),
  traceId: z.string().nullable(),
  payload: z.string().min(1),
});

type TestEvent = z.infer<typeof TestEventSchema>;

class DummyKafkaConsumer extends BaseIdempotentKafkaConsumer<TestEvent> {
  constructor(
    kafka: KafkaService,
    redis: RedisService,
    config: ConfigService<ApiEnvConfig, true>,
    logger: StructuredLoggerService,
    private readonly onProcess: (event: TestEvent) => Promise<void> | void,
    telemetry?: TelemetryMetricsPort,
  ) {
    super(
      kafka,
      redis,
      config,
      logger,
      {
        consumerGroupId: 'pokeverse-test-group',
        topic: 'pokeverse.test.events.v1',
        contextName: 'DummyKafkaConsumer',
        schema: TestEventSchema,
        duplicateLogPrefix: 'Duplicate test event skipped',
      },
      telemetry,
    );
  }

  protected processEvent(event: TestEvent): Promise<void> | void {
    return this.onProcess(event);
  }
}

describe('BaseIdempotentKafkaConsumer', () => {
  it('connects, subscribes, forwards messages and disconnects cleanly outside test env', async () => {
    let messageHandler: MessageHandler | undefined;

    const connect = jest.fn().mockResolvedValue(undefined);
    const subscribe = jest.fn().mockResolvedValue(undefined);
    const disconnect = jest.fn().mockResolvedValue(undefined);
    const run = jest.fn(
      (options: {
        eachMessage: (payload: EachMessagePayload) => Promise<void>;
      }) => {
        messageHandler = options.eachMessage;
        return Promise.resolve();
      },
    );

    const createConsumer = jest.fn(() => ({
      connect,
      subscribe,
      run,
      disconnect,
    }));
    const acquireIdempotencyLock = jest.fn().mockResolvedValue(true);
    const processed: string[] = [];

    const consumer = new DummyKafkaConsumer(
      {
        createConsumer,
        publishDlq: jest.fn(),
      } as unknown as KafkaService,
      { acquireIdempotencyLock } as unknown as RedisService,
      { get: jest.fn(() => 'production') } as unknown as ConfigService<
        ApiEnvConfig,
        true
      >,
      new StructuredLoggerService(),
      (event) => {
        processed.push(event.payload);
      },
    );

    await consumer.onModuleInit();
    expect(createConsumer).toHaveBeenCalledWith('pokeverse-test-group');
    expect(connect).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith({
      topic: 'pokeverse.test.events.v1',
      fromBeginning: false,
    });

    const eventId = '550e8400-e29b-41d4-a716-446655440123';
    await messageHandler?.({
      topic: 'pokeverse.test.events.v1',
      partition: 0,
      heartbeat: () => Promise.resolve(),
      pause: () => () => undefined,
      message: {
        key: Buffer.from('key-1'),
        value: Buffer.from(
          JSON.stringify({ eventId, traceId: null, payload: 'ok' }),
        ),
        timestamp: '0',
        attributes: 0,
        offset: '0',
        headers: {},
      },
    });
    expect(processed).toEqual(['ok']);

    await consumer.onModuleDestroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('records OTel spans/metrics and rolls back idempotency lock when processEvent throws synchronously', async () => {
    const withSpan = jest.fn(
      (
        _name: string,
        _attributes: Record<string, string | number | boolean>,
        fn: () => Promise<unknown>,
      ) => fn(),
    );
    const recordKafkaConsume = jest.fn();
    const acquireIdempotencyLock = jest.fn().mockResolvedValue(true);
    const releaseIdempotencyLock = jest.fn().mockResolvedValue(undefined);

    let shouldFail = true;
    const consumer = new DummyKafkaConsumer(
      {
        createConsumer: jest.fn(),
        publishDlq: jest.fn(),
      } as unknown as KafkaService,
      {
        acquireIdempotencyLock,
        releaseIdempotencyLock,
      } as unknown as RedisService,
      { get: jest.fn(() => 'test') } as unknown as ConfigService<
        ApiEnvConfig,
        true
      >,
      new StructuredLoggerService(),
      () => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error('Sync gateway error');
        }
      },
      {
        withSpan,
        recordKafkaConsume,
      } as unknown as TelemetryMetricsPort,
    );

    const eventId = '550e8400-e29b-41d4-a716-446655440456';
    const raw = JSON.stringify({ eventId, traceId: null, payload: 'ping' });

    await expect(
      consumer.handleRawMessage('pokeverse.test.events.v1', raw),
    ).rejects.toThrow('Sync gateway error');
    expect(releaseIdempotencyLock).toHaveBeenCalledWith(
      'pokeverse-test-group',
      eventId,
    );
    expect(recordKafkaConsume).not.toHaveBeenCalled();

    await expect(
      consumer.handleRawMessage('pokeverse.test.events.v1', raw),
    ).resolves.toBe('processed');
    expect(withSpan).toHaveBeenCalledWith(
      'kafka.consume',
      {
        'messaging.system': 'kafka',
        'messaging.destination.name': 'pokeverse.test.events.v1',
        'messaging.consumer.group.name': 'pokeverse-test-group',
      },
      expect.any(Function),
    );
    expect(recordKafkaConsume).toHaveBeenCalledWith(
      'pokeverse.test.events.v1',
      'pokeverse-test-group',
      'processed',
      expect.any(Number),
    );
  });
});
