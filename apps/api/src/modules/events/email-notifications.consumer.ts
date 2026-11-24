import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailNotificationEventSchema,
  EncryptedOutboxPayloadSchema,
  KAFKA_TOPICS,
  type EmailNotificationEvent,
} from '@pokeverse/shared';
import { CryptoService } from '../../common/security/crypto.service';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import {
  TELEMETRY_METRICS_PORT,
  type TelemetryMetricsPort,
} from '../../common/telemetry/telemetry.port';
import type { ApiEnvConfig } from '../../config/env.schema';
import { KafkaService } from '../../infra/kafka.service';
import { RedisService } from '../../infra/redis.service';
import { MailService } from '../notifications/mail.service';
import { BaseIdempotentKafkaConsumer } from './base-idempotent-kafka.consumer';

const EMAIL_CONSUMER_GROUP = 'pokeverse-email-mailer';

@Injectable()
export class EmailNotificationsConsumerService extends BaseIdempotentKafkaConsumer<EmailNotificationEvent> {
  constructor(
    kafka: KafkaService,
    redis: RedisService,
    private readonly crypto: CryptoService,
    private readonly mailService: MailService,
    config: ConfigService<ApiEnvConfig, true>,
    logger: StructuredLoggerService,
    @Optional()
    @Inject(TELEMETRY_METRICS_PORT)
    telemetry?: TelemetryMetricsPort,
  ) {
    super(
      kafka,
      redis,
      config,
      logger,
      {
        consumerGroupId: EMAIL_CONSUMER_GROUP,
        topic: KAFKA_TOPICS.NOTIFICATIONS_EMAIL,
        contextName: EmailNotificationsConsumerService.name,
        schema: EmailNotificationEventSchema,
        duplicateLogPrefix: 'Duplicate email Kafka event skipped',
        decodeErrorMessage: 'Invalid or undecryptable email event payload',
        redactDlqPayload: true,
      },
      telemetry,
    );
  }

  protected override decodePayload(rawValue: string): unknown {
    const outer: unknown = JSON.parse(rawValue);
    const encrypted = EncryptedOutboxPayloadSchema.parse(outer);
    return this.crypto.decryptJson<unknown>(encrypted.ciphertext);
  }

  protected processEvent(event: EmailNotificationEvent): Promise<void> {
    return this.mailService.sendNotification(event);
  }
}
