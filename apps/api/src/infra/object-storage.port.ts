import { BadRequestException } from '@nestjs/common';

export const OBJECT_STORAGE_PORT = Symbol('OBJECT_STORAGE_PORT');

const SAFE_STORAGE_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;
const MAX_STORAGE_KEY_LENGTH = 256;

export interface PutStorageObjectInput {
  readonly bucket: string;
  readonly key: string;
  readonly body: Buffer | Uint8Array;
  readonly contentType: string;
}

export interface StoredObjectMetadata {
  readonly key: string;
  readonly contentLength: number;
  readonly contentType: string;
  readonly sha256: string;
}

export interface ObjectStoragePort {
  isEnabled(): boolean;
  verifyBucketsReachable(
    buckets: readonly string[],
    timeoutMs: number,
  ): Promise<void>;
}

export interface ObjectStorageReadWritePort extends ObjectStoragePort {
  ensureBucketsExist(buckets: readonly string[]): Promise<void>;
  putObject(input: PutStorageObjectInput): Promise<StoredObjectMetadata>;
  headObject(bucket: string, key: string): Promise<StoredObjectMetadata | null>;
  deleteObject(bucket: string, key: string): Promise<void>;
}

export function assertSafeStorageKey(rawKey: string): string {
  const key = rawKey.trim();
  if (key.length === 0 || key.length > MAX_STORAGE_KEY_LENGTH) {
    throw new BadRequestException('Chave de armazenamento S3 inválida.');
  }
  if (
    key.startsWith('/') ||
    key.endsWith('/') ||
    key.includes('..') ||
    key.includes('\\') ||
    key.includes('//')
  ) {
    throw new BadRequestException(
      'Chave de armazenamento S3 contém sequência de caminho insegura.',
    );
  }
  if (!SAFE_STORAGE_KEY_PATTERN.test(key)) {
    throw new BadRequestException(
      'Chave de armazenamento S3 contém caracteres não permitidos.',
    );
  }
  return key;
}
