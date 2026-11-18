import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type DependencyStatus,
  HEALTH_PROBE_TIMEOUT_MS,
} from '@pokeverse/shared';
import type { ApiEnvConfig } from '../config/env.schema';
import { KafkaService } from './kafka.service';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

export interface ReadinessChecks {
  readonly postgres: DependencyStatus;
  readonly redis: DependencyStatus;
  readonly kafka: DependencyStatus;
  readonly s3: DependencyStatus;
}

@Injectable()
export class InfraProbesService implements OnModuleDestroy {
  private readonly s3: S3Client;
  private readonly romBucket: string;
  private readonly savesBucket: string;

  constructor(
    config: ConfigService<ApiEnvConfig, true>,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly kafka: KafkaService,
  ) {
    this.s3 = new S3Client({
      region: 'us-east-1',
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get('MINIO_ROOT_USER', { infer: true }),
        secretAccessKey: config.get('MINIO_ROOT_PASSWORD', { infer: true }),
      },
    });

    this.romBucket = config.get('S3_BUCKET_ROMS', { infer: true });
    this.savesBucket = config.get('S3_BUCKET_SAVES', { infer: true });
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
      await this.prisma.$queryRaw`SELECT 1`;
    });
  }

  async checkRedis(): Promise<DependencyStatus> {
    return this.measureProbe('Redis unreachable', async () => {
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        throw new Error(`Unexpected PING reply: ${pong}`);
      }
    });
  }

  async checkKafka(): Promise<DependencyStatus> {
    return this.measureProbe('Kafka broker unreachable', async () => {
      const brokersCount = await this.kafka.describeCluster();
      if (brokersCount === 0) {
        throw new Error('Zero active brokers reported by cluster');
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

  onModuleDestroy(): void {
    this.s3.destroy();
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
    } catch {
      return {
        status: 'down',
        latencyMs: Math.max(0, Math.round(performance.now() - start)),
        detail: fallbackDetail,
      };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
