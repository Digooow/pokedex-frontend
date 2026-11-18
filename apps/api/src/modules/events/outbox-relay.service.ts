import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import { KafkaService } from '../../infra/kafka.service';
import { PrismaService } from '../../infra/prisma.service';

const OUTBOX_BATCH_SIZE = 25;
const OUTBOX_IDLE_POLL_MS = 750;
const OUTBOX_BUSY_POLL_MS = 100;
const MAX_OUTBOX_RETRIES = 5;

interface ClaimedOutboxRow {
  readonly id: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly retryCount: number;
}

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private currentBatchPromise: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaService,
    private readonly config: ConfigService<ApiEnvConfig, true>,
    private readonly logger: StructuredLoggerService,
  ) {}

  onModuleInit(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') {
      return;
    }
    this.scheduleNext(OUTBOX_BUSY_POLL_MS);
  }

  async processPendingBatch(): Promise<number> {
    // Keep DB transaction ultrashort: claim rows, commit, then publish to Kafka outside tx.
    const pendingRows = await this.prisma.$transaction(async (tx) => {
      return tx.$queryRaw<ClaimedOutboxRow[]>`
        SELECT id, "aggregateId", "eventType", payload, "retryCount"
        FROM "OutboxEvent"
        WHERE "status" = 'PENDING'
        ORDER BY "createdAt" ASC
        LIMIT ${OUTBOX_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;
    });

    if (pendingRows.length === 0) {
      return 0;
    }

    const publishedIds: string[] = [];

    for (const row of pendingRows) {
      const traceId = this.extractTraceId(row.payload);
      try {
        await this.kafka.publish(row.eventType, row.aggregateId, row.payload, {
          eventId: row.id,
          ...(traceId
            ? { traceparent: `00-${traceId}-0000000000000001-01` }
            : {}),
        });
        publishedIds.push(row.id);
      } catch (error) {
        await this.recordDeliveryFailure(row, error, traceId);
      }
    }

    if (publishedIds.length > 0) {
      await this.prisma.outboxEvent.updateMany({
        where: { id: { in: publishedIds } },
        data: { status: 'PUBLISHED', processedAt: new Date() },
      });
    }

    return pendingRows.length;
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.currentBatchPromise) {
      await this.currentBatchPromise.catch(() => undefined);
    }
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopped) {
      return;
    }
    this.pollTimer = setTimeout(() => {
      this.currentBatchPromise = this.runSafeTick();
    }, delayMs);
  }

  private async runSafeTick(): Promise<void> {
    let processedCount = 0;
    try {
      processedCount = await this.processPendingBatch();
    } catch (error) {
      this.logger.emitEvent(
        'warn',
        `Outbox relay cycle failed: ${String(error)}`,
        {
          context: OutboxRelayService.name,
          errorCode: 'OUTBOX_POLL_WARN',
        },
      );
    } finally {
      this.currentBatchPromise = null;
      this.scheduleNext(
        processedCount >= OUTBOX_BATCH_SIZE
          ? OUTBOX_BUSY_POLL_MS
          : OUTBOX_IDLE_POLL_MS,
      );
    }
  }

  private async recordDeliveryFailure(
    row: ClaimedOutboxRow,
    error: unknown,
    traceId: string | null,
  ): Promise<void> {
    const nextRetry = row.retryCount + 1;
    const reason =
      error instanceof Error ? error.message : 'Kafka publish failed';
    const exhausted = nextRetry >= MAX_OUTBOX_RETRIES;

    await this.prisma.outboxEvent.update({
      where: { id: row.id },
      data: {
        retryCount: nextRetry,
        lastError: reason.slice(0, 500),
        ...(exhausted ? { status: 'FAILED', processedAt: new Date() } : {}),
      },
    });

    if (exhausted) {
      await this.kafka.publishDlq(
        row.eventType,
        JSON.stringify(row.payload),
        `Outbox retries exhausted (${MAX_OUTBOX_RETRIES}): ${reason}`,
        traceId,
      );
    }
  }

  private extractTraceId(payload: unknown): string | null {
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'traceId' in payload
    ) {
      const value = (payload as { traceId?: unknown }).traceId;
      return typeof value === 'string' && value.length === 32 ? value : null;
    }
    return null;
  }
}
