import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KAFKA_TOPICS } from '@pokeverse/shared';
import {
  type Consumer,
  Kafka,
  type KafkaConfig,
  type Producer,
  type SASLOptions,
  logLevel,
} from 'kafkajs';
import type { ApiEnvConfig } from '../config/env.schema';
import { StructuredLoggerService } from '../common/telemetry/structured-logger.service';

function normalizePem(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith('base64:')) {
    return Buffer.from(trimmed.slice('base64:'.length), 'base64').toString(
      'utf8',
    );
  }
  return trimmed.replaceAll(String.raw`\n`, '\n');
}

function buildSaslOptions(
  config: ConfigService<ApiEnvConfig, true>,
): SASLOptions | undefined {
  const mechanism = config.get('KAFKA_SASL_MECHANISM', { infer: true });
  const username = config.get('KAFKA_SASL_USERNAME', { infer: true }).trim();
  const password = config.get('KAFKA_SASL_PASSWORD', { infer: true }).trim();
  if (!mechanism || !username || !password) {
    return undefined;
  }
  return { mechanism, username, password };
}

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly kafka: Kafka;
  private readonly producer: Producer;
  private readonly consumers: Consumer[] = [];
  private readonly replicationFactor: number;
  private readonly autoCreateTopics: boolean;
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

    const sslEnabled = config.get('KAFKA_SSL', { infer: true });
    const caPem = normalizePem(config.get('KAFKA_SSL_CA_PEM', { infer: true }));
    const certPem = normalizePem(
      config.get('KAFKA_SSL_CERT_PEM', { infer: true }),
    );
    const keyPem = normalizePem(
      config.get('KAFKA_SSL_KEY_PEM', { infer: true }),
    );
    const sasl = buildSaslOptions(config);
    const connectTimeoutMs = config.get('KAFKA_CONNECT_TIMEOUT_MS', {
      infer: true,
    });
    this.replicationFactor = config.get('KAFKA_REPLICATION_FACTOR', {
      infer: true,
    });
    this.autoCreateTopics = config.get('KAFKA_AUTO_CREATE_TOPICS', {
      infer: true,
    });

    const sslConfig =
      sslEnabled || caPem || certPem || keyPem
        ? {
            rejectUnauthorized: true,
            ...(caPem ? { ca: [caPem] } : {}),
            ...(certPem ? { cert: certPem } : {}),
            ...(keyPem ? { key: keyPem } : {}),
          }
        : undefined;

    const kafkaConfig: KafkaConfig = {
      clientId: 'pokeverse-api',
      brokers,
      connectionTimeout: connectTimeoutMs,
      requestTimeout: connectTimeoutMs,
      retry: { retries: 3, initialRetryTime: 200 },
      logLevel: logLevel.ERROR,
      ...(sslConfig ? { ssl: sslConfig } : {}),
      ...(sasl ? { sasl } : {}),
    };

    this.kafka = new Kafka(kafkaConfig);

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: this.autoCreateTopics,
    });
  }

  async onModuleInit(): Promise<void> {
    if (this.autoCreateTopics) {
      await this.ensureTopics([
        KAFKA_TOPICS.WORLD_EVENTS,
        KAFKA_TOPICS.NOTIFICATIONS_EMAIL,
        KAFKA_TOPICS.DLQ,
      ]).catch((error: unknown) => {
        this.logger.emitEvent(
          'warn',
          `Kafka topic bootstrap check skipped/non-fatal: ${String(error)}`,
          { context: KafkaService.name },
        );
      });
    }
    await this.producer.connect();
    this.producerConnected = true;
  }

  async ensureTopics(topics: readonly string[]): Promise<void> {
    const admin = this.kafka.admin();
    try {
      await admin.connect();
      const existing = new Set(await admin.listTopics());
      const missing = topics.filter((topic) => !existing.has(topic));
      if (missing.length === 0) {
        return;
      }
      await admin.createTopics({
        waitForLeaders: true,
        topics: missing.map((topic) => ({
          topic,
          numPartitions: 2,
          replicationFactor: this.replicationFactor,
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
