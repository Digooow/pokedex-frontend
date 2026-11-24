import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Consumer } from 'kafkajs';
import type { ZodType } from 'zod';
import type { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type {
  KafkaConsumeOutcome,
  TelemetryMetricsPort,
} from '../../common/telemetry/telemetry.port';
import type { ApiEnvConfig } from '../../config/env.schema';
import type { KafkaService } from '../../infra/kafka.service';
import type { RedisService } from '../../infra/redis.service';

export interface IdempotentKafkaEvent {
  readonly eventId: string;
  readonly traceId: string | null;
}

export interface IdempotentKafkaConsumerOptions<
  TEvent extends IdempotentKafkaEvent,
> {
  readonly consumerGroupId: string;
  readonly topic: string;
  readonly contextName: string;
  readonly schema: ZodType<TEvent>;
  readonly duplicateLogPrefix: string;
  readonly decodeErrorMessage?: string;
  readonly redactDlqPayload?: boolean;
}

export abstract class BaseIdempotentKafkaConsumer<
  TEvent extends IdempotentKafkaEvent,
>
  implements OnModuleInit, OnModuleDestroy
{
  private consumer: Consumer | null = null;

  protected constructor(
    protected readonly kafka: KafkaService,
    protected readonly redis: RedisService,
    protected readonly config: ConfigService<ApiEnvConfig, true>,
    protected readonly logger: StructuredLoggerService,
    protected readonly options: IdempotentKafkaConsumerOptions<TEvent>,
    protected readonly telemetry?: TelemetryMetricsPort,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') {
      return;
    }

    this.consumer = this.kafka.createConsumer(this.options.consumerGroupId);
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: this.options.topic,
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
        this.options.consumerGroupId,
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
        'messaging.consumer.group.name': this.options.consumerGroupId,
      },
      execute,
    );
  }

  protected decodePayload(rawValue: string): unknown {
    const parsed: unknown = JSON.parse(rawValue);
    return parsed;
  }

  protected abstract processEvent(event: TEvent): Promise<void> | void;

  private async consumeMessage(
    topic: string,
    rawValue: string,
  ): Promise<KafkaConsumeOutcome> {
    const event = await this.parseAndValidateEvent(topic, rawValue);
    if (!event) {
      return 'dlq';
    }

    const isFirstDelivery = await this.redis.acquireIdempotencyLock(
      this.options.consumerGroupId,
      event.eventId,
    );
    if (!isFirstDelivery) {
      this.logger.emitEvent(
        'debug',
        `${this.options.duplicateLogPrefix}: ${event.eventId}`,
        {
          context: this.options.contextName,
          traceId: event.traceId,
        },
      );
      return 'duplicate';
    }

    return this.executeWithIdempotencyRollback(event);
  }

  private async parseAndValidateEvent(
    topic: string,
    rawValue: string,
  ): Promise<TEvent | null> {
    const dlqPayload = this.options.redactDlqPayload
      ? JSON.stringify({ redacted: true })
      : rawValue;

    let decoded: unknown;
    try {
      decoded = this.decodePayload(rawValue);
    } catch {
      await this.kafka.publishDlq(
        topic,
        dlqPayload,
        this.options.decodeErrorMessage ?? 'Invalid JSON payload',
        null,
      );
      return null;
    }

    const parsed = this.options.schema.safeParse(decoded);
    if (!parsed.success) {
      await this.kafka.publishDlq(
        topic,
        dlqPayload,
        `Zod schema mismatch: ${parsed.error.issues.map((i) => i.path.join('.')).join(',')}`,
        null,
      );
      return null;
    }

    return parsed.data;
  }

  private async executeWithIdempotencyRollback(
    event: TEvent,
  ): Promise<KafkaConsumeOutcome> {
    try {
      await this.processEvent(event);
      return 'processed';
    } catch (error) {
      if (typeof this.redis.releaseIdempotencyLock === 'function') {
        await this.redis
          .releaseIdempotencyLock(this.options.consumerGroupId, event.eventId)
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
