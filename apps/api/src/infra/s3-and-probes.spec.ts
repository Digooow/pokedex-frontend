import { createHash } from 'node:crypto';
import { S3Client } from '@aws-sdk/client-s3';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ApiEnvConfig } from '../config/env.schema';
import { InfraProbesService } from './infra-probes.service';
import type { KafkaService } from './kafka.service';
import { assertSafeStorageKey } from './object-storage.port';
import type { PrismaService } from './prisma.service';
import type { RedisService } from './redis.service';
import { S3ObjectStorageAdapter } from './s3-object-storage.adapter';

function createS3ConfigMock(
  enabled: boolean,
): ConfigService<ApiEnvConfig, true> {
  const map: Record<string, unknown> = {
    S3_ENABLED: enabled,
    S3_ENDPOINT: 'http://127.0.0.1:9000',
    MINIO_ROOT_USER: 'minioadmin',
    MINIO_ROOT_PASSWORD: 'minioadmin_password',
    S3_BUCKET_ROMS: 'pokeverse-roms',
    S3_BUCKET_SAVES: 'pokeverse-saves',
  };
  return {
    get: jest.fn((key: keyof ApiEnvConfig) => map[key]),
  } as unknown as ConfigService<ApiEnvConfig, true>;
}

describe('S3ObjectStorageAdapter, assertSafeStorageKey & InfraProbesService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects path-traversal or malformed S3 keys and accepts canonical trainer object paths', () => {
    expect(assertSafeStorageKey('saves/trainer-1/slot-0.sav')).toBe(
      'saves/trainer-1/slot-0.sav',
    );
    for (const badKey of [
      '',
      '   ',
      '../secret.txt',
      'saves/../secret.txt',
      '/leading-slash',
      'trailing-slash/',
      'double//slash',
      'win\\slash',
      'bad space.sav',
      'a'.repeat(257),
    ]) {
      expect(() => assertSafeStorageKey(badKey)).toThrow(BadRequestException);
    }
  });

  it('rejects read/write operations when S3 is disabled and executes put/head/delete/bucket checks when enabled', async () => {
    const disabledAdapter = new S3ObjectStorageAdapter(
      createS3ConfigMock(false),
    );
    expect(disabledAdapter.isEnabled()).toBe(false);
    await disabledAdapter.verifyBucketsReachable(['pokeverse-saves'], 500);
    await expect(
      disabledAdapter.putObject({
        bucket: 'pokeverse-saves',
        key: 'saves/1.sav',
        body: Buffer.from('abc'),
        contentType: 'application/octet-stream',
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    const adapter = new S3ObjectStorageAdapter(createS3ConfigMock(true));
    expect(adapter.isEnabled()).toBe(true);
    const payload = Buffer.from('pokeverse-save-state-v1');
    const expectedSha = createHash('sha256').update(payload).digest('hex');

    const sendSpy = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({
        ContentLength: payload.byteLength,
        ContentType: 'application/octet-stream',
        Metadata: { sha256: expectedSha },
      } as never)
      .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } } as never)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('NotFound') as never)
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({} as never);

    const putMeta = await adapter.putObject({
      bucket: 'pokeverse-saves',
      key: 'saves/trainer-1/slot-0.sav',
      body: payload,
      contentType: 'application/octet-stream',
    });
    expect(putMeta).toEqual({
      key: 'saves/trainer-1/slot-0.sav',
      contentLength: payload.byteLength,
      contentType: 'application/octet-stream',
      sha256: expectedSha,
    });

    expect(
      await adapter.headObject('pokeverse-saves', 'saves/trainer-1/slot-0.sav'),
    ).toEqual(putMeta);
    expect(
      await adapter.headObject('pokeverse-saves', 'saves/missing.sav'),
    ).toBeNull();

    await adapter.deleteObject('pokeverse-saves', 'saves/trainer-1/slot-0.sav');
    await adapter.ensureBucketsExist(['pokeverse-roms']);
    await adapter.verifyBucketsReachable(['pokeverse-roms'], 1000);
    expect(sendSpy).toHaveBeenCalledTimes(7);
    adapter.onModuleDestroy();
  });

  it('probes postgres, redis, kafka, and s3 health independently', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as PrismaService;
    const redis = {
      ping: jest.fn().mockResolvedValue('PONG'),
    } as unknown as RedisService;
    const kafka = {
      describeCluster: jest.fn().mockResolvedValue(1),
    } as unknown as KafkaService;
    const storage = {
      isEnabled: jest.fn().mockReturnValue(false),
      verifyBucketsReachable: jest.fn().mockResolvedValue(undefined),
    };

    const probes = new InfraProbesService(
      createS3ConfigMock(false),
      prisma,
      redis,
      kafka,
      storage,
    );

    const healthy = await probes.checkAll();
    expect(healthy.postgres.status).toBe('up');
    expect(healthy.redis.status).toBe('up');
    expect(healthy.kafka.status).toBe('up');
    expect(healthy.s3).toEqual({
      status: 'up',
      latencyMs: 0,
      detail: 'disabled',
    });

    (redis.ping as jest.Mock).mockResolvedValueOnce('UNEXPECTED');
    (kafka.describeCluster as jest.Mock).mockResolvedValueOnce(0);
    storage.isEnabled.mockReturnValueOnce(true);
    storage.verifyBucketsReachable.mockRejectedValueOnce(new Error('S3 down'));

    const degraded = await probes.checkAll();
    expect(degraded.redis.status).toBe('down');
    expect(degraded.kafka.status).toBe('down');
    expect(degraded.s3.status).toBe('down');
  });
});
