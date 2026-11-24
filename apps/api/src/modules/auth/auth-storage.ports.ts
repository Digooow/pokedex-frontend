export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
export const OTP_STORE = Symbol('OTP_STORE');

export interface SessionRepository {
  getJson<T>(key: string): Promise<T | null>;
  setJsonEx(key: string, ttlSeconds: number, value: unknown): Promise<void>;
  delKeys(...keys: string[]): Promise<number>;
  addToSetWithTtl(
    key: string,
    member: string,
    ttlSeconds: number,
  ): Promise<void>;
  getSetMembers(key: string): Promise<string[]>;
  removeSetMembers?(key: string, ...members: string[]): Promise<void>;
}

export interface OtpStore {
  getJson<T>(key: string): Promise<T | null>;
  setJsonEx(key: string, ttlSeconds: number, value: unknown): Promise<void>;
  delKeys(...keys: string[]): Promise<number>;
  getString?(key: string): Promise<string | null>;
  incrementCounterWithTtl?(key: string, ttlSeconds: number): Promise<number>;
}
