import { ConfigService } from '@nestjs/config';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import type { KafkaService } from '../../infra/kafka.service';
import type {
  ClaimedOutboxEvent,
  OutboxEventRepository,
} from './outbox-event.repository';
import { OutboxRelayService } from './outbox-relay.service';

describe('OutboxRelayService atomic lease & DLQ handling', () => {
  const configMock = {
    get: jest.fn(() => 'test'),
  } as unknown as ConfigService<ApiEnvConfig, true>;

  it('publishes claimed rows, marks published on success, and releases lease on non-exhausted failure', async () => {
    const claimedRows: ClaimedOutboxEvent[] = [
      {
        id: 'ev-1',
        aggregateId: 'agg-1',
        eventType: 'pokeverse.world.events.v1',
        payload: {
          eventId: 'ev-1',
          traceId: '0123456789abcdef0123456789abcdef',
        },
        retryCount: 0,
      },
      {
        id: 'ev-2',
        aggregateId: 'agg-2',
        eventType: 'pokeverse.notifications.email.v1',
        payload: { version: 1, ciphertext: 'v1:abc' },
        retryCount: 1,
      },
    ];

    const claimPendingBatch = jest.fn().mockResolvedValue(claimedRows);
    const markBatchPublished = jest.fn().mockResolvedValue(undefined);
    const recordDeliveryFailure = jest.fn().mockResolvedValue(undefined);
    const repositoryMock = {
      claimPendingBatch,
      markBatchPublished,
      recordDeliveryFailure,
    } as unknown as OutboxEventRepository;

    const publish = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Kafka broker busy'));
    const publishDlq = jest.fn().mockResolvedValue(undefined);
    const kafkaMock = { publish, publishDlq } as unknown as KafkaService;

    const relay = new OutboxRelayService(
      repositoryMock,
      kafkaMock,
      configMock,
      new StructuredLoggerService(),
    );

    const processed = await relay.processPendingBatch();

    expect(processed).toBe(2);
    expect(claimPendingBatch).toHaveBeenCalledWith(25, 60);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(markBatchPublished).toHaveBeenCalledWith(['ev-1']);
    expect(recordDeliveryFailure).toHaveBeenCalledWith({
      id: 'ev-2',
      retryCount: 2,
      lastError: 'Kafka broker busy',
      exhausted: false,
    });
    expect(publishDlq).not.toHaveBeenCalled();
  });

  it('marks row FAILED and publishes to DLQ when MAX_OUTBOX_RETRIES is exhausted', async () => {
    const traceId = 'abcdef0123456789abcdef0123456789';
    const exhaustedRow: ClaimedOutboxEvent[] = [
      {
        id: 'ev-3',
        aggregateId: 'agg-3',
        eventType: 'pokeverse.world.events.v1',
        payload: { eventId: 'ev-3', traceId },
        retryCount: 4,
      },
    ];

    const claimPendingBatch = jest.fn().mockResolvedValue(exhaustedRow);
    const markBatchPublished = jest.fn().mockResolvedValue(undefined);
    const recordDeliveryFailure = jest.fn().mockResolvedValue(undefined);
    const repositoryMock = {
      claimPendingBatch,
      markBatchPublished,
      recordDeliveryFailure,
    } as unknown as OutboxEventRepository;

    const publish = jest.fn().mockRejectedValue(new Error('Permanent outage'));
    const publishDlq = jest.fn().mockResolvedValue(undefined);
    const kafkaMock = { publish, publishDlq } as unknown as KafkaService;

    const relay = new OutboxRelayService(
      repositoryMock,
      kafkaMock,
      configMock,
      new StructuredLoggerService(),
    );

    const processed = await relay.processPendingBatch();

    expect(processed).toBe(1);
    expect(markBatchPublished).not.toHaveBeenCalled();
    expect(recordDeliveryFailure).toHaveBeenCalledWith({
      id: 'ev-3',
      retryCount: 5,
      lastError: 'Permanent outage',
      exhausted: true,
    });
    expect(publishDlq).toHaveBeenCalledWith(
      'pokeverse.world.events.v1',
      JSON.stringify(exhaustedRow[0]?.payload),
      'Outbox retries exhausted (5): Permanent outage',
      traceId,
    );
  });
});
