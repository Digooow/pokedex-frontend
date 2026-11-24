import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvConfig } from '../config/env.schema';
import type { ObjectStoragePort } from './object-storage.port';

@Injectable()
export class S3ObjectStorageAdapter
  implements ObjectStoragePort, OnModuleDestroy
{
  private readonly s3: S3Client | null;
  private readonly enabled: boolean;

  constructor(config: ConfigService<ApiEnvConfig, true>) {
    this.enabled = config.get('S3_ENABLED', { infer: true });
    this.s3 = this.enabled
      ? new S3Client({
          region: 'us-east-1',
          endpoint: config.get('S3_ENDPOINT', { infer: true }),
          forcePathStyle: true,
          credentials: {
            accessKeyId: config.get('MINIO_ROOT_USER', { infer: true }),
            secretAccessKey: config.get('MINIO_ROOT_PASSWORD', { infer: true }),
          },
        })
      : null;
  }

  isEnabled(): boolean {
    return this.enabled && this.s3 !== null;
  }

  async verifyBucketsReachable(
    buckets: readonly string[],
    timeoutMs: number,
  ): Promise<void> {
    const client = this.s3;
    if (!this.enabled || !client) {
      return;
    }

    const signal = AbortSignal.timeout(timeoutMs);
    await Promise.all(
      buckets.map((bucket) =>
        client.send(new HeadBucketCommand({ Bucket: bucket }), {
          abortSignal: signal,
        }),
      ),
    );
  }

  onModuleDestroy(): void {
    this.s3?.destroy();
  }
}
