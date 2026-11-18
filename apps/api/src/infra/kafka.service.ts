import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HEALTH_PROBE_TIMEOUT_MS, KAFKA_TOPICS } from '@pokeverse/shared';
import { type Consumer, Kafka, type Producer, logLevel } from 'kafkajs';
import type { ApiEnvConfig } from '../config/env.schema';
import { StructuredLoggerService } from '../common/telemetry/structured-logger.service';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly kafka: Kafka;
  private readonly producer: Producer;
  private readonly consumers: Consumer[] = [];
  private producerConnected = false;

  constructor(
    config: ConfigService<ApiEnvConfig, true>,
    private readonly logger: StructuredLoggerService,
  ) {
    const brokers = config
      .get('KAFKA_BROKERS', { infer: true })
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    this.kafka = new Kafka({
      clientId: 'pokeverse-api',
      brokers,
      connectionTimeout: HEALTH_PROBE_TIMEOUT_MS,
      requestTimeout: HEALTH_PROBE_TIMEOUT_MS,
      retry: { retries: 3, initialRetryTime: 200 },
      logLevel: logLevel.ERROR,
    });

    this.producer = this.kafka.producer({ allowAutoTopicCreation: true });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureTopics([
      KAFKA_TOPICS.WORLD_EVENTS,
      KAFKA_TOPICS.NOTIFICATIONS_EMAIL,
      KAFKA_TOPICS.DLQ,
    ]);
    await this.producer.connect();
    this.producerConnected = true;
  }

  async ensureTopics(topics: readonly string[]): Promise<void> {
    const admin = this.kafka.admin();
    try {
      await admin.connect();
      await admin.createTopics({
        waitForLeaders: true,
        topics: topics.map((topic) => ({
          topic,
          numPartitions: 2,
          replicationFactor: 1,
        })),
      });
    } finally {
      await admin.disconnect().catch(() => undefined);
    }
  }

  async describeCluster(): Promise<number> {
    const admin = this.kafka.admin();
    try {
      await admin.connect();
      const cluster = await admin.describeCluster();
      return cluster.brokers.length;
    } finally {
      await admin.disconnect().catch(() => undefined);
    }
  }

  async publish(
    topic: string,
    key: string,
    payload: unknown,
    headers?: Record<string, string>,
  ): Promise<void> {
    if (!this.producerConnected) {
      await this.producer.connect();
      this.producerConnected = true;
    }

    await this.producer.send({
      topic,
      messages: [
        {
          key,
          value: JSON.stringify(payload),
          headers,
        },
      ],
    });
  }

  async publishDlq(
    originalTopic: string,
    rawValue: string,
    reason: string,
    traceId: string | null,
  ): Promise<void> {
    try {
      await this.publish(
        KAFKA_TOPICS.DLQ,
        originalTopic,
        {
          originalTopic,
          reason,
          rawValue,
          failedAt: new Date().toISOString(),
        },
        traceId ? { trace_id: traceId } : undefined,
      );
    } catch (error) {
      this.logger.emitEvent(
        'error',
        `Failed publishing to DLQ: ${String(error)}`,
        {
          context: KafkaService.name,
          errorCode: 'KAFKA_DLQ_ERROR',
          traceId,
        },
      );
    }
  }

  createConsumer(groupId: string): Consumer {
    const consumer = this.kafka.consumer({ groupId });
    this.consumers.push(consumer);
    return consumer;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(
      this.consumers.map((consumer) => consumer.disconnect()),
    );
    if (this.producerConnected) {
      await this.producer.disconnect().catch(() => undefined);
    }
  }
}
