import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KAFKA_TOPICS, WorldTickerEventSchema } from '@pokeverse/shared';
import type { Consumer } from 'kafkajs';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import {
  TELEMETRY_METRICS_PORT,
  type KafkaConsumeOutcome,
  type TelemetryMetricsPort,
} from '../../common/telemetry/telemetry.port';
import type { ApiEnvConfig } from '../../config/env.schema';
import { KafkaService } from '../../infra/kafka.service';
import { RedisService } from '../../infra/redis.service';
import { WorldGateway } from '../world/world.gateway';

const CONSUMER_GROUP_ID = 'pokeverse-world-ticker';

@Injectable()
export class WorldEventsConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private consumer: Consumer | null = null;

  constructor(
    private readonly kafka: KafkaService,
    private readonly redis: RedisService,
    private readonly worldGateway: WorldGateway,
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

    this.consumer = this.kafka.createConsumer(CONSUMER_GROUP_ID);
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: KAFKA_TOPICS.WORLD_EVENTS,
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
        CONSUMER_GROUP_ID,
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
        'messaging.consumer.group.name': CONSUMER_GROUP_ID,
      },
      execute,
    );
  }

  private async consumeMessage(
    topic: string,
    rawValue: string,
  ): Promise<KafkaConsumeOutcome> {
    let decoded: unknown;
    try {
      decoded = JSON.parse(rawValue);
    } catch {
      await this.kafka.publishDlq(
        topic,
        rawValue,
        'Invalid JSON payload',
        null,
      );
      return 'dlq';
    }

    const parsed = WorldTickerEventSchema.safeParse(decoded);
    if (!parsed.success) {
      await this.kafka.publishDlq(
        topic,
        rawValue,
        `Zod schema mismatch: ${parsed.error.issues.map((i) => i.path.join('.')).join(',')}`,
        null,
      );
      return 'dlq';
    }

    const isFirstDelivery = await this.redis.acquireIdempotencyLock(
      CONSUMER_GROUP_ID,
      parsed.data.eventId,
    );
    if (!isFirstDelivery) {
      this.logger.emitEvent(
        'debug',
        `Duplicate Kafka event skipped: ${parsed.data.eventId}`,
        {
          context: WorldEventsConsumerService.name,
          traceId: parsed.data.traceId,
        },
      );
      return 'duplicate';
    }

    try {
      this.worldGateway.broadcastGlobalEvent(parsed.data);
      return 'processed';
    } catch (error) {
      if (typeof this.redis.releaseIdempotencyLock === 'function') {
        await this.redis
          .releaseIdempotencyLock(CONSUMER_GROUP_ID, parsed.data.eventId)
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
