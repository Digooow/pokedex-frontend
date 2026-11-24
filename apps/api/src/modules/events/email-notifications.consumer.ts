import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailNotificationEventSchema,
  EncryptedOutboxPayloadSchema,
  KAFKA_TOPICS,
} from '@pokeverse/shared';
import type { Consumer } from 'kafkajs';
import { CryptoService } from '../../common/security/crypto.service';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import {
  TELEMETRY_METRICS_PORT,
  type KafkaConsumeOutcome,
  type TelemetryMetricsPort,
} from '../../common/telemetry/telemetry.port';
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
    @Optional()
    @Inject(TELEMETRY_METRICS_PORT)
    private readonly telemetry?: TelemetryMetricsPort,
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
  ): Promise<KafkaConsumeOutcome> {
    const startedAt = performance.now();
    const execute = async (): Promise<KafkaConsumeOutcome> => {
      const outcome = await this.consumeMessage(topic, rawValue);
      this.telemetry?.recordKafkaConsume(
        topic,
        EMAIL_CONSUMER_GROUP,
        outcome,
        Math.max(0, performance.now() - startedAt),
      );
      return outcome;
    };

    if (!this.telemetry) {
      return execute();
    }

    return this.telemetry.withSpan(
      'kafka.consume',
      {
        'messaging.system': 'kafka',
        'messaging.destination.name': topic,
        'messaging.consumer.group.name': EMAIL_CONSUMER_GROUP,
      },
      execute,
    );
  }

  private async consumeMessage(
    topic: string,
    rawValue: string,
  ): Promise<KafkaConsumeOutcome> {
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
