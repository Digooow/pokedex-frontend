import { OutboxStatus } from '@prisma/client';
import type { PrismaService } from '../../infra/prisma.service';
import {
  type ClaimedOutboxEvent,
  OutboxEventRepository,
} from './outbox-event.repository';

describe('OutboxEventRepository (atomic lease CTE & OutboxStatus transitions)', () => {
  it('claims pending outbox rows via transactional $queryRaw using OutboxStatus.PENDING', async () => {
    const claimed: ClaimedOutboxEvent[] = [
      {
        id: 'ev-1',
        aggregateId: 'agg-1',
        eventType: 'pokeverse.world.events.v1',
        payload: { eventId: 'ev-1' },
        retryCount: 0,
      },
    ];
    const queryRaw = jest.fn().mockResolvedValue(claimed);
    const prismaMock = {
      $transaction: jest.fn(
        (
          fn: (tx: {
            $queryRaw: typeof queryRaw;
          }) => Promise<ClaimedOutboxEvent[]>,
        ) => fn({ $queryRaw: queryRaw }),
      ),
    } as unknown as PrismaService;

    const repository = new OutboxEventRepository(prismaMock);
    const rows = await repository.claimPendingBatch(25, 60);

    expect(rows).toEqual(claimed);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const callArgs = queryRaw.mock.calls[0] as unknown[];
    expect(callArgs.slice(1)).toEqual([OutboxStatus.PENDING, 60, 25]);
  });

  it('marks non-empty batches as OutboxStatus.PUBLISHED and skips empty batches', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prismaMock = {
      outboxEvent: { updateMany },
    } as unknown as PrismaService;

    const repository = new OutboxEventRepository(prismaMock);

    await repository.markBatchPublished([]);
    expect(updateMany).not.toHaveBeenCalled();

    await repository.markBatchPublished(['ev-1']);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ev-1'] } },
      data: {
        status: OutboxStatus.PUBLISHED,
        processedAt: expect.any(Date) as Date,
      },
    });
  });

  it('releases lease on retryable failure and marks OutboxStatus.FAILED when exhausted', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prismaMock = {
      outboxEvent: { update },
    } as unknown as PrismaService;

    const repository = new OutboxEventRepository(prismaMock);

    await repository.recordDeliveryFailure({
      id: 'ev-2',
      retryCount: 2,
      lastError: 'Kafka broker busy',
      exhausted: false,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'ev-2' },
      data: {
        retryCount: 2,
        lastError: 'Kafka broker busy',
        processedAt: null,
      },
    });

    await repository.recordDeliveryFailure({
      id: 'ev-3',
      retryCount: 5,
      lastError: 'Permanent outage',
      exhausted: true,
    });
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 'ev-3' },
      data: {
        retryCount: 5,
        lastError: 'Permanent outage',
        processedAt: expect.any(Date) as Date,
        status: OutboxStatus.FAILED,
      },
    });
  });
});
