import type { ConfigService } from '@nestjs/config';
import { KAFKA_TOPICS } from '@pokeverse/shared';
import { OutboxStatus } from '@prisma/client';
import { CryptoService } from '../../common/security/crypto.service';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import type { KafkaService } from '../../infra/kafka.service';
import type { RedisService } from '../../infra/redis.service';
import type { EmailTransport } from '../notifications/email-transport.port';
import { MailService } from '../notifications/mail.service';
import { EmailNotificationsConsumerService } from './email-notifications.consumer';
import type {
  ClaimedOutboxEvent,
  OutboxEventRepository,
  RecordOutboxFailureParams,
} from './outbox-event.repository';
import { OutboxRelayService } from './outbox-relay.service';

interface ChaosOutboxRow {
  readonly id: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: unknown;
  retryCount: number;
  status: OutboxStatus;
  processedAt: Date | null;
  lastError: string | null;
}

class InMemoryAtomicLeaseOutboxRepository {
  constructor(readonly rows: ChaosOutboxRow[]) {}

  claimPendingBatch(
    batchSize: number,
    leaseSeconds: number,
  ): Promise<ClaimedOutboxEvent[]> {
    const now = Date.now();
    const cutoff = now - leaseSeconds * 1000;
    const claimed: ClaimedOutboxEvent[] = [];

    for (const row of this.rows) {
      if (claimed.length >= batchSize) break;
      const leaseExpired =
        row.processedAt === null || row.processedAt.getTime() < cutoff;
      if (row.status === OutboxStatus.PENDING && leaseExpired) {
        row.processedAt = new Date(now);
        claimed.push({
          id: row.id,
          aggregateId: row.aggregateId,
          eventType: row.eventType,
          payload: row.payload,
          retryCount: row.retryCount,
        });
      }
    }
    return Promise.resolve(claimed);
  }

  markBatchPublished(eventIds: readonly string[]): Promise<void> {
    for (const row of this.rows) {
      if (eventIds.includes(row.id)) {
        row.status = OutboxStatus.PUBLISHED;
        row.processedAt = new Date();
      }
    }
    return Promise.resolve();
  }

  recordDeliveryFailure(params: RecordOutboxFailureParams): Promise<void> {
    const row = this.rows.find((entry) => entry.id === params.id);
    if (row) {
      row.retryCount = params.retryCount;
      row.lastError = params.lastError;
      row.processedAt = params.exhausted ? new Date() : null;
      if (params.exhausted) {
        row.status = OutboxStatus.FAILED;
      }
    }
    return Promise.resolve();
  }
}

function createEventsConfigMock(): ConfigService<ApiEnvConfig, true> {
  const values: Record<string, unknown> = {
    NODE_ENV: 'test',
    APP_ENCRYPTION_KEY:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    MAIL_FROM: 'PokéVerse OS <no-reply@pokeverse.local>',
  };
  return {
    get: (key: keyof ApiEnvConfig) => values[key],
  } as unknown as ConfigService<ApiEnvConfig, true>;
}

describe('Events Chaos & Concurrency Resilience', () => {
  it('prevents duplicate Kafka publishing when two OutboxRelayService workers race concurrently', async () => {
    const repo = new InMemoryAtomicLeaseOutboxRepository([
      {
        id: 'evt-race-1',
        aggregateId: 'tr-1',
        eventType: KAFKA_TOPICS.WORLD_EVENTS,
        payload: { eventId: 'evt-race-1', traceId: 'a'.repeat(32) },
        retryCount: 0,
        status: OutboxStatus.PENDING,
        processedAt: null,
        lastError: null,
      },
      {
        id: 'evt-race-2',
        aggregateId: 'tr-2',
        eventType: KAFKA_TOPICS.WORLD_EVENTS,
        payload: { eventId: 'evt-race-2', traceId: 'b'.repeat(32) },
        retryCount: 0,
        status: OutboxStatus.PENDING,
        processedAt: null,
        lastError: null,
      },
    ]);

    const publishedKeys: string[] = [];
    const kafkaMock = {
      publish: jest.fn(
        async (_topic: string, _key: string, payload: unknown) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          publishedKeys.push((payload as { eventId: string }).eventId);
        },
      ),
      publishDlq: jest.fn(),
    } as unknown as KafkaService;

    const config = createEventsConfigMock();
    const logger = new StructuredLoggerService();
    const workerA = new OutboxRelayService(
      repo as unknown as OutboxEventRepository,
      kafkaMock,
      config,
      logger,
    );
    const workerB = new OutboxRelayService(
      repo as unknown as OutboxEventRepository,
      kafkaMock,
      config,
      logger,
    );

    const [countA, countB] = await Promise.all([
      workerA.processPendingBatch(),
      workerB.processPendingBatch(),
    ]);

    expect(countA + countB).toBe(2);
    expect(publishedKeys.slice().sort()).toEqual(['evt-race-1', 'evt-race-2']);
    expect(repo.rows.every((r) => r.status === OutboxStatus.PUBLISHED)).toBe(
      true,
    );
  });

  it('releases Outbox lease across transient Kafka failures and routes to DLQ on 5th exhaustion', async () => {
    const repo = new InMemoryAtomicLeaseOutboxRepository([
      {
        id: 'evt-dlq-1',
        aggregateId: 'tr-9',
        eventType: KAFKA_TOPICS.NOTIFICATIONS_EMAIL,
        payload: { traceId: 'c'.repeat(32), ciphertext: 'opaque' },
        retryCount: 0,
        status: OutboxStatus.PENDING,
        processedAt: null,
        lastError: null,
      },
    ]);

    const publishDlq = jest.fn().mockResolvedValue(undefined);
    const kafkaMock = {
      publish: jest.fn().mockRejectedValue(new Error('Kafka broker timeout')),
      publishDlq,
    } as unknown as KafkaService;

    const relay = new OutboxRelayService(
      repo as unknown as OutboxEventRepository,
      kafkaMock,
      createEventsConfigMock(),
      new StructuredLoggerService(),
    );

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await relay.processPendingBatch();
      expect(repo.rows[0]?.status).toBe(OutboxStatus.PENDING);
      expect(repo.rows[0]?.processedAt).toBeNull();
      expect(repo.rows[0]?.retryCount).toBe(attempt);
      expect(publishDlq).not.toHaveBeenCalled();
    }

    await relay.processPendingBatch();
    expect(repo.rows[0]?.status).toBe(OutboxStatus.FAILED);
    expect(repo.rows[0]?.retryCount).toBe(5);
    expect(publishDlq).toHaveBeenCalledWith(
      KAFKA_TOPICS.NOTIFICATIONS_EMAIL,
      expect.any(String),
      expect.stringContaining('Outbox retries exhausted (5)'),
      'c'.repeat(32),
    );
  });

  it('rolls back Redis SET NX lock on transient MailTransport outage and quarantines undecryptable payloads to DLQ', async () => {
    const config = createEventsConfigMock();
    const crypto = new CryptoService(config);
    const locks = new Set<string>();
    const redisMock = {
      acquireIdempotencyLock: jest.fn((group: string, id: string) => {
        const key = `${group}:${id}`;
        if (locks.has(key)) return Promise.resolve(false);
        locks.add(key);
        return Promise.resolve(true);
      }),
      releaseIdempotencyLock: jest.fn((group: string, id: string) => {
        locks.delete(`${group}:${id}`);
        return Promise.resolve();
      }),
    } as unknown as RedisService;

    let failFirstSend = true;
    const transport: EmailTransport = {
      mode: 'smtp',
      send: () => {
        if (failFirstSend) {
          failFirstSend = false;
          return Promise.reject(new Error('SMTP 421 temporary failure'));
        }
        return Promise.resolve();
      },
    };
    const logger = new StructuredLoggerService();
    const mailService = new MailService(config, logger, transport);
    const publishDlq = jest.fn().mockResolvedValue(undefined);
    const kafkaMock = { publishDlq } as unknown as KafkaService;

    const consumer = new EmailNotificationsConsumerService(
      kafkaMock,
      redisMock,
      crypto,
      mailService,
      config,
      logger,
    );

    const envelope = JSON.stringify({
      version: 1,
      ciphertext: crypto.encryptJson({
        eventId: '22222222-2222-4222-8222-222222222222',
        template: 'welcome',
        toEmail: 'brock@pokeverse.local',
        username: 'Brock',
        subject: 'Bem-vindo',
        traceId: 'd'.repeat(32),
        requestedAt: new Date().toISOString(),
      }),
    });

    await expect(
      consumer.handleRawMessage(KAFKA_TOPICS.NOTIFICATIONS_EMAIL, envelope),
    ).rejects.toThrow('SMTP 421 temporary failure');
    expect(locks.size).toBe(0);

    await expect(
      consumer.handleRawMessage(KAFKA_TOPICS.NOTIFICATIONS_EMAIL, envelope),
    ).resolves.toBe('processed');
    expect(locks.size).toBe(1);

    await expect(
      consumer.handleRawMessage(
        KAFKA_TOPICS.NOTIFICATIONS_EMAIL,
        JSON.stringify({ version: 1, ciphertext: 'corrupted-ciphertext' }),
      ),
    ).resolves.toBe('dlq');
    expect(publishDlq).toHaveBeenCalledWith(
      KAFKA_TOPICS.NOTIFICATIONS_EMAIL,
      JSON.stringify({ redacted: true }),
      'Invalid or undecryptable email event payload',
      null,
    );
  });
});
