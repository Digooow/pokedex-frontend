import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HEALTH_PROBE_TIMEOUT_MS } from '@pokeverse/shared';
import Redis from 'ioredis';
import type { ApiEnvConfig } from '../config/env.schema';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(config: ConfigService<ApiEnvConfig, true>) {
    this.client = new Redis(config.get('REDIS_URL', { infer: true }), {
      lazyConnect: true,
      connectTimeout: HEALTH_PROBE_TIMEOUT_MS,
      commandTimeout: HEALTH_PROBE_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }

  async ensureConnected(): Promise<void> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
  }

  async ping(): Promise<string> {
    await this.ensureConnected();
    return String(await this.client.ping());
  }

  async getJson<T>(key: string): Promise<T | null> {
    await this.ensureConnected();
    const raw = await this.client.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  }

  async setJsonEx(
    key: string,
    ttlSeconds: number,
    value: unknown,
  ): Promise<void> {
    await this.ensureConnected();
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  /** Marks an event ID once atomically (NX) so Kafka consumers stay idempotent. */
  async acquireIdempotencyLock(
    consumerGroup: string,
    eventId: string,
    ttlSeconds = 86400,
  ): Promise<boolean> {
    await this.ensureConnected();
    const key = `idemp:${consumerGroup}:${eventId}`;
    const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'end' || this.client.status === 'wait') {
      return;
    }
    await this.client.quit().catch(() => {
      this.client.disconnect();
    });
  }
}
