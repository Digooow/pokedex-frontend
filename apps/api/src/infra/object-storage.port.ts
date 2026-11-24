export const OBJECT_STORAGE_PORT = Symbol('OBJECT_STORAGE_PORT');

export interface ObjectStoragePort {
  isEnabled(): boolean;
  verifyBucketsReachable(
    buckets: readonly string[],
    timeoutMs: number,
  ): Promise<void>;
}
