import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailNotificationEventSchema,
  EncryptedOutboxPayloadSchema,
  KAFKA_TOPICS,
} from '@pokeverse/shared';
import type { Consumer } from 'kafkajs';
import { CryptoService } from '../../common/security/crypto.service';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import { KafkaService } from '../../infra/kafka.service';
import { RedisService } from '../../infra/redis.service';
import { MailService } from '../notifications/mail.service';

const EMAIL_CONSUMER_GROUP = 'pokeverse-email-mailer';

@Injectable()
export class EmailNotificationsConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private consumer: Consumer | null = null;

  constructor(
    private readonly kafka: KafkaService,
    private readonly redis: RedisService,
    private readonly crypto: CryptoService,
    private readonly mailService: MailService,
    private readonly config: ConfigService<ApiEnvConfig, true>,
    private readonly logger: StructuredLoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') {
      return;
    }

    this.consumer = this.kafka.createConsumer(EMAIL_CONSUMER_GROUP);
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: KAFKA_TOPICS.NOTIFICATIONS_EMAIL,
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        const rawValue = message.value?.toString('utf8') ?? '';
        await this.handleRawMessage(topic, rawValue);
      },
    });
  }

  async handleRawMessage(
    topic: string,
    rawValue: string,
  ): Promise<'processed' | 'duplicate' | 'dlq'> {
    let candidateEvent: unknown;
    try {
      const outer: unknown = JSON.parse(rawValue);
      const encrypted = EncryptedOutboxPayloadSchema.parse(outer);
      candidateEvent = this.crypto.decryptJson<unknown>(encrypted.ciphertext);
    } catch {
      await this.kafka.publishDlq(
        topic,
        JSON.stringify({ redacted: true }),
        'Invalid or undecryptable email event payload',
        null,
      );
      return 'dlq';
    }

    const parsed = EmailNotificationEventSchema.safeParse(candidateEvent);
    if (!parsed.success) {
      await this.kafka.publishDlq(
        topic,
        JSON.stringify({ redacted: true }),
        `Zod schema mismatch: ${parsed.error.issues.map((i) => i.path.join('.')).join(',')}`,
        null,
      );
      return 'dlq';
    }

    const isFirstDelivery = await this.redis.acquireIdempotencyLock(
      EMAIL_CONSUMER_GROUP,
      parsed.data.eventId,
    );
    if (!isFirstDelivery) {
      this.logger.emitEvent(
        'debug',
        `Duplicate email Kafka event skipped: ${parsed.data.eventId}`,
        {
          context: EmailNotificationsConsumerService.name,
          traceId: parsed.data.traceId,
        },
      );
      return 'duplicate';
    }

    try {
      await this.mailService.sendNotification(parsed.data);
      return 'processed';
    } catch (error) {
      if (typeof this.redis.releaseIdempotencyLock === 'function') {
        await this.redis
          .releaseIdempotencyLock(EMAIL_CONSUMER_GROUP, parsed.data.eventId)
          .catch(() => undefined);
      }
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect().catch(() => undefined);
    }
  }
}
