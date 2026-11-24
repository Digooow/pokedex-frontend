import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KAFKA_TOPICS,
  WorldTickerEventSchema,
  type WorldTickerEvent,
} from '@pokeverse/shared';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import {
  TELEMETRY_METRICS_PORT,
  type TelemetryMetricsPort,
} from '../../common/telemetry/telemetry.port';
import type { ApiEnvConfig } from '../../config/env.schema';
import { KafkaService } from '../../infra/kafka.service';
import { RedisService } from '../../infra/redis.service';
import { WorldGateway } from '../world/world.gateway';
import { BaseIdempotentKafkaConsumer } from './base-idempotent-kafka.consumer';

const CONSUMER_GROUP_ID = 'pokeverse-world-ticker';

@Injectable()
export class WorldEventsConsumerService extends BaseIdempotentKafkaConsumer<WorldTickerEvent> {
  constructor(
    kafka: KafkaService,
    redis: RedisService,
    private readonly worldGateway: WorldGateway,
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
        consumerGroupId: CONSUMER_GROUP_ID,
        topic: KAFKA_TOPICS.WORLD_EVENTS,
        contextName: WorldEventsConsumerService.name,
        schema: WorldTickerEventSchema,
        duplicateLogPrefix: 'Duplicate Kafka event skipped',
      },
      telemetry,
    );
  }

  protected processEvent(event: WorldTickerEvent): void {
    this.worldGateway.broadcastGlobalEvent(event);
  }
}
