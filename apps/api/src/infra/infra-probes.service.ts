import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type DependencyStatus,
  HEALTH_PROBE_TIMEOUT_MS,
} from '@pokeverse/shared';
import Redis from 'ioredis';
import { Kafka, logLevel } from 'kafkajs';
import { Pool } from 'pg';
import type { ApiEnvConfig } from '../config/env.schema';

export interface ReadinessChecks {
  readonly postgres: DependencyStatus;
  readonly redis: DependencyStatus;
  readonly kafka: DependencyStatus;
  readonly s3: DependencyStatus;
}

@Injectable()
export class InfraProbesService implements OnModuleDestroy {
  private readonly pgPool: Pool;
  private readonly redis: Redis;
  private readonly kafka: Kafka;
  private readonly s3: S3Client;
  private readonly romBucket: string;
  private readonly savesBucket: string;

  constructor(private readonly config: ConfigService<ApiEnvConfig, true>) {
    this.pgPool = new Pool({
      connectionString: this.config.get('DATABASE_URL', { infer: true }),
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: HEALTH_PROBE_TIMEOUT_MS,
      query_timeout: HEALTH_PROBE_TIMEOUT_MS,
    });

    this.redis = new Redis(this.config.get('REDIS_URL', { infer: true }), {
      lazyConnect: true,
      connectTimeout: HEALTH_PROBE_TIMEOUT_MS,
      commandTimeout: HEALTH_PROBE_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    const brokers = this.config
      .get('KAFKA_BROKERS', { infer: true })
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    this.kafka = new Kafka({
      clientId: 'pokeverse-api-health',
      brokers,
      connectionTimeout: HEALTH_PROBE_TIMEOUT_MS,
      requestTimeout: HEALTH_PROBE_TIMEOUT_MS,
      retry: { retries: 0 },
      logLevel: logLevel.ERROR,
    });

    this.s3 = new S3Client({
      region: 'us-east-1',
      endpoint: this.config.get('S3_ENDPOINT', { infer: true }),
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.get('MINIO_ROOT_USER', { infer: true }),
        secretAccessKey: this.config.get('MINIO_ROOT_PASSWORD', {
          infer: true,
        }),
      },
    });

    this.romBucket = this.config.get('S3_BUCKET_ROMS', { infer: true });
    this.savesBucket = this.config.get('S3_BUCKET_SAVES', { infer: true });
  }

  async checkAll(): Promise<ReadinessChecks> {
    const [postgres, redis, kafka, s3] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkKafka(),
      this.checkS3(),
    ]);

    return { postgres, redis, kafka, s3 };
  }

  async checkPostgres(): Promise<DependencyStatus> {
    return this.measureProbe('PostgreSQL unreachable', async () => {
      await this.pgPool.query('SELECT 1');
    });
  }

  async checkRedis(): Promise<DependencyStatus> {
    return this.measureProbe('Redis unreachable', async () => {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }
      const pong = String(await this.redis.ping());
      if (pong !== 'PONG') {
        throw new Error(`Unexpected PING reply: ${pong}`);
      }
    });
  }

  async checkKafka(): Promise<DependencyStatus> {
    return this.measureProbe('Kafka broker unreachable', async () => {
      const admin = this.kafka.admin();
      try {
        await admin.connect();
        const cluster = await admin.describeCluster();
        if (cluster.brokers.length === 0) {
          throw new Error('Zero active brokers reported by cluster');
        }
      } finally {
        try {
          await admin.disconnect();
        } catch {
          /* Ignore disconnect error during teardown */
        }
      }
    });
  }

  async checkS3(): Promise<DependencyStatus> {
    return this.measureProbe('S3 object storage unreachable', async () => {
      const signal = AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS);
      await Promise.all([
        this.s3.send(new HeadBucketCommand({ Bucket: this.romBucket }), {
          abortSignal: signal,
        }),
        this.s3.send(new HeadBucketCommand({ Bucket: this.savesBucket }), {
          abortSignal: signal,
        }),
      ]);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.pgPool.end(),
      this.redis.status === 'end' || this.redis.status === 'wait'
        ? Promise.resolve()
        : this.redis.quit().catch(() => {
            this.redis.disconnect();
          }),
      Promise.resolve(this.s3.destroy()),
    ]);
  }

  private async measureProbe(
    fallbackDetail: string,
    probeFn: () => Promise<void>,
  ): Promise<DependencyStatus> {
    const start = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        probeFn(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(fallbackDetail)),
            HEALTH_PROBE_TIMEOUT_MS + 100,
          );
        }),
      ]);

      return {
        status: 'up',
        latencyMs: Math.max(0, Math.round(performance.now() - start)),
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Math.max(0, Math.round(performance.now() - start)),
        detail:
          error instanceof Error && error.message
            ? fallbackDetail
            : fallbackDetail,
      };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
