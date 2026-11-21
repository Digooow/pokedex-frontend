import { ConfigService } from '@nestjs/config';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import type { KafkaService } from '../../infra/kafka.service';
import type { PrismaService } from '../../infra/prisma.service';
import { OutboxRelayService } from './outbox-relay.service';

interface ClaimedRowFixture {
  readonly id: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly retryCount: number;
}

function createRelayPrismaMock(claimedRows: readonly ClaimedRowFixture[]) {
  const outboxUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const outboxUpdate = jest.fn().mockResolvedValue({});
  const prismaMock = {
    $transaction: jest.fn(
      (
        fn: (tx: {
          $queryRaw: () => Promise<readonly ClaimedRowFixture[]>;
        }) => Promise<readonly ClaimedRowFixture[]>,
      ) =>
        fn({
          $queryRaw: jest.fn().mockResolvedValue(claimedRows),
        }),
    ),
    outboxEvent: {
      updateMany: outboxUpdateMany,
      update: outboxUpdate,
    },
  } as unknown as PrismaService;

  return { prismaMock, outboxUpdateMany, outboxUpdate };
}

describe('OutboxRelayService atomic lease & DLQ handling', () => {
  const configMock = {
    get: jest.fn(() => 'test'),
  } as unknown as ConfigService<ApiEnvConfig, true>;

  it('publishes claimed rows, marks published on success, and releases lease on non-exhausted failure', async () => {
    const claimedRows: ClaimedRowFixture[] = [
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

    const { prismaMock, outboxUpdateMany, outboxUpdate } =
      createRelayPrismaMock(claimedRows);

    const publish = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Kafka broker busy'));
    const publishDlq = jest.fn().mockResolvedValue(undefined);
    const kafkaMock = { publish, publishDlq } as unknown as KafkaService;

    const relay = new OutboxRelayService(
      prismaMock,
      kafkaMock,
      configMock,
      new StructuredLoggerService(),
    );

    const processed = await relay.processPendingBatch();

    expect(processed).toBe(2);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(outboxUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ev-1'] } },
      data: { status: 'PUBLISHED', processedAt: expect.any(Date) as Date },
    });
    expect(outboxUpdate).toHaveBeenCalledWith({
      where: { id: 'ev-2' },
      data: {
        retryCount: 2,
        lastError: 'Kafka broker busy',
        processedAt: null,
      },
    });
    expect(publishDlq).not.toHaveBeenCalled();
  });

  it('marks row FAILED and publishes to DLQ when MAX_OUTBOX_RETRIES is exhausted', async () => {
    const traceId = 'abcdef0123456789abcdef0123456789';
    const exhaustedRow: ClaimedRowFixture[] = [
      {
        id: 'ev-3',
        aggregateId: 'agg-3',
        eventType: 'pokeverse.world.events.v1',
        payload: { eventId: 'ev-3', traceId },
        retryCount: 4,
      },
    ];

    const { prismaMock, outboxUpdateMany, outboxUpdate } =
      createRelayPrismaMock(exhaustedRow);

    const publish = jest.fn().mockRejectedValue(new Error('Permanent outage'));
    const publishDlq = jest.fn().mockResolvedValue(undefined);
    const kafkaMock = { publish, publishDlq } as unknown as KafkaService;

    const relay = new OutboxRelayService(
      prismaMock,
      kafkaMock,
      configMock,
      new StructuredLoggerService(),
    );

    const processed = await relay.processPendingBatch();

    expect(processed).toBe(1);
    expect(outboxUpdateMany).not.toHaveBeenCalled();
    expect(outboxUpdate).toHaveBeenCalledWith({
      where: { id: 'ev-3' },
      data: {
        retryCount: 5,
        lastError: 'Permanent outage',
        processedAt: expect.any(Date) as Date,
        status: 'FAILED',
      },
    });
    expect(publishDlq).toHaveBeenCalledWith(
      'pokeverse.world.events.v1',
      JSON.stringify(exhaustedRow[0]?.payload),
      'Outbox retries exhausted (5): Permanent outage',
      traceId,
    );
  });
});
