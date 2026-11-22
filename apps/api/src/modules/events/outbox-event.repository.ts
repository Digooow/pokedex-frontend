import { Injectable } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma.service';

export interface ClaimedOutboxEvent {
  readonly id: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly retryCount: number;
}

export interface RecordOutboxFailureParams {
  readonly id: string;
  readonly retryCount: number;
  readonly lastError: string;
  readonly exhausted: boolean;
}

@Injectable()
export class OutboxEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  claimPendingBatch(
    batchSize: number,
    leaseSeconds: number,
  ): Promise<ClaimedOutboxEvent[]> {
    return this.prisma.$transaction((tx) => {
      return tx.$queryRaw<ClaimedOutboxEvent[]>`
        WITH claimed AS (
          SELECT id
          FROM "OutboxEvent"
          WHERE "status" = ${OutboxStatus.PENDING}::"OutboxStatus"
            AND ("processedAt" IS NULL OR "processedAt" < NOW() - make_interval(secs => ${leaseSeconds}))
          ORDER BY "createdAt" ASC
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "OutboxEvent" AS o
        SET "processedAt" = NOW()
        FROM claimed
        WHERE o.id = claimed.id
        RETURNING o.id, o."aggregateId", o."eventType", o.payload, o."retryCount"
      `;
    });
  }

  async markBatchPublished(eventIds: readonly string[]): Promise<void> {
    if (eventIds.length === 0) {
      return;
    }

    await this.prisma.outboxEvent.updateMany({
      where: { id: { in: [...eventIds] } },
      data: { status: OutboxStatus.PUBLISHED, processedAt: new Date() },
    });
  }

  async recordDeliveryFailure(
    params: RecordOutboxFailureParams,
  ): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: params.id },
      data: {
        retryCount: params.retryCount,
        lastError: params.lastError,
        processedAt: params.exhausted ? new Date() : null,
        ...(params.exhausted ? { status: OutboxStatus.FAILED } : {}),
      },
    });
  }
}
