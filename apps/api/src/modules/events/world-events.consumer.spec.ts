import { ConfigService } from '@nestjs/config';
import { KAFKA_TOPICS } from '@pokeverse/shared';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import type { KafkaService } from '../../infra/kafka.service';
import type { RedisService } from '../../infra/redis.service';
import type { WorldGateway } from '../world/world.gateway';
import { WorldEventsConsumerService } from './world-events.consumer';

describe('WorldEventsConsumerService idempotency & DLQ', () => {
  const validEvent = {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    eventType: 'pokedex.slot.saved',
    trainerId: '550e8400-e29b-41d4-a716-446655440001',
    username: 'Red_Kanto',
    summary: 'Red_Kanto gravou Pikachu (#0025) no Slot 1.',
    occurredAt: new Date().toISOString(),
    traceId: null,
  };

  function createHarness(firstLock: boolean) {
    const publishDlq = jest.fn().mockResolvedValue(undefined);
    const acquireIdempotencyLock = jest.fn().mockResolvedValue(firstLock);
    const broadcastGlobalEvent = jest.fn();

    const consumer = new WorldEventsConsumerService(
      { publishDlq } as unknown as KafkaService,
      { acquireIdempotencyLock } as unknown as RedisService,
      { broadcastGlobalEvent } as unknown as WorldGateway,
      { get: jest.fn(() => 'test') } as unknown as ConfigService<
        ApiEnvConfig,
        true
      >,
      new StructuredLoggerService(),
    );

    return { consumer, publishDlq, broadcastGlobalEvent };
  }

  it('broadcasts valid first-time events and skips duplicates idempotently', async () => {
    const first = createHarness(true);
    expect(
      await first.consumer.handleRawMessage(
        KAFKA_TOPICS.WORLD_EVENTS,
        JSON.stringify(validEvent),
      ),
    ).toBe('processed');
    expect(first.broadcastGlobalEvent).toHaveBeenCalledTimes(1);

    const dup = createHarness(false);
    expect(
      await dup.consumer.handleRawMessage(
        KAFKA_TOPICS.WORLD_EVENTS,
        JSON.stringify(validEvent),
      ),
    ).toBe('duplicate');
    expect(dup.broadcastGlobalEvent).not.toHaveBeenCalled();
  });

  it('routes malformed JSON or Zod-invalid events directly to DLQ', async () => {
    const brokenJson = createHarness(true);
    expect(
      await brokenJson.consumer.handleRawMessage(
        KAFKA_TOPICS.WORLD_EVENTS,
        '{invalid',
      ),
    ).toBe('dlq');
    expect(brokenJson.publishDlq).toHaveBeenCalledTimes(1);

    const invalidSchema = createHarness(true);
    expect(
      await invalidSchema.consumer.handleRawMessage(
        KAFKA_TOPICS.WORLD_EVENTS,
        JSON.stringify({ eventId: 'not-a-uuid' }),
      ),
    ).toBe('dlq');
    expect(invalidSchema.publishDlq).toHaveBeenCalledTimes(1);
    expect(invalidSchema.broadcastGlobalEvent).not.toHaveBeenCalled();
  });
});
