import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type DependencyStatus,
  HEALTH_PROBE_TIMEOUT_MS,
  POSTGRES_PROBE_TIMEOUT_MS,
} from '@pokeverse/shared';
import type { ApiEnvConfig } from '../config/env.schema';
import { KafkaService } from './kafka.service';
import {
  OBJECT_STORAGE_PORT,
  type ObjectStoragePort,
} from './object-storage.port';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

export interface ReadinessChecks {
  readonly postgres: DependencyStatus;
  readonly redis: DependencyStatus;
  readonly kafka: DependencyStatus;
  readonly s3: DependencyStatus;
}

@Injectable()
export class InfraProbesService {
  private readonly romBucket: string;
  private readonly savesBucket: string;

  constructor(
    config: ConfigService<ApiEnvConfig, true>,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly kafka: KafkaService,
    @Inject(OBJECT_STORAGE_PORT)
    private readonly objectStorage: ObjectStoragePort,
  ) {
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

  checkPostgres(): Promise<DependencyStatus> {
    return this.measureProbe(
      'PostgreSQL unreachable',
      async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      },
      POSTGRES_PROBE_TIMEOUT_MS,
    );
  }

  checkRedis(): Promise<DependencyStatus> {
    return this.measureProbe('Redis unreachable', async () => {
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        throw new Error(`Unexpected PING reply: ${pong}`);
      }
    });
  }

  checkKafka(): Promise<DependencyStatus> {
    return this.measureProbe('Kafka broker unreachable', async () => {
      const brokersCount = await this.kafka.describeCluster();
      if (brokersCount === 0) {
        throw new Error('Zero active brokers reported by cluster');
      }
    });
  }

  checkS3(): Promise<DependencyStatus> {
    if (!this.objectStorage.isEnabled()) {
      return Promise.resolve({
        status: 'up',
        latencyMs: 0,
        detail: 'disabled',
      });
    }

    return this.measureProbe('S3 object storage unreachable', () =>
      this.objectStorage.verifyBucketsReachable(
        [this.romBucket, this.savesBucket],
        HEALTH_PROBE_TIMEOUT_MS,
      ),
    );
  }

  private async measureProbe(
    fallbackDetail: string,
    probeFn: () => Promise<void>,
    timeoutMs: number = HEALTH_PROBE_TIMEOUT_MS + 100,
  ): Promise<DependencyStatus> {
    const start = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        probeFn(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(fallbackDetail)),
            timeoutMs,
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
