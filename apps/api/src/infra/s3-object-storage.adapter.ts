import { createHash } from 'node:crypto';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvConfig } from '../config/env.schema';
import {
  type ObjectStorageReadWritePort,
  type PutStorageObjectInput,
  type StoredObjectMetadata,
  assertSafeStorageKey,
} from './object-storage.port';

interface S3ErrorLike {
  readonly name?: unknown;
  readonly $metadata?: { readonly httpStatusCode?: unknown };
}

function isS3NotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as S3ErrorLike;
  return (
    candidate.name === 'NotFound' ||
    candidate.name === 'NoSuchKey' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

@Injectable()
export class S3ObjectStorageAdapter
  implements ObjectStorageReadWritePort, OnModuleDestroy
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

  async ensureBucketsExist(buckets: readonly string[]): Promise<void> {
    const client = this.requireClient();
    for (const bucket of buckets) {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    }
  }

  async putObject(input: PutStorageObjectInput): Promise<StoredObjectMetadata> {
    const client = this.requireClient();
    const safeKey = assertSafeStorageKey(input.key);
    const sha256 = createHash('sha256').update(input.body).digest('hex');

    await client.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: safeKey,
        Body: input.body,
        ContentType: input.contentType,
        Metadata: { sha256 },
      }),
    );

    return {
      key: safeKey,
      contentLength: input.body.byteLength,
      contentType: input.contentType,
      sha256,
    };
  }

  async headObject(
    bucket: string,
    rawKey: string,
  ): Promise<StoredObjectMetadata | null> {
    const client = this.requireClient();
    const safeKey = assertSafeStorageKey(rawKey);
    try {
      const result = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: safeKey }),
      );
      return {
        key: safeKey,
        contentLength: result.ContentLength ?? 0,
        contentType: result.ContentType ?? 'application/octet-stream',
        sha256: result.Metadata?.['sha256'] ?? '',
      };
    } catch (error) {
      if (isS3NotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async deleteObject(bucket: string, rawKey: string): Promise<void> {
    const client = this.requireClient();
    const safeKey = assertSafeStorageKey(rawKey);
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: safeKey }),
    );
  }

  onModuleDestroy(): void {
    this.s3?.destroy();
  }

  private requireClient(): S3Client {
    if (!this.enabled || !this.s3) {
      throw new ServiceUnavailableException(
        'Armazenamento S3/MinIO está desabilitado neste ambiente.',
      );
    }
    return this.s3;
  }
}
