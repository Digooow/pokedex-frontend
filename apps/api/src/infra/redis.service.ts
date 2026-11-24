import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { HEALTH_PROBE_TIMEOUT_MS } from '@pokeverse/shared';
import Redis from 'ioredis';
import {
  TELEMETRY_METRICS_PORT,
  type TelemetryMetricsPort,
} from '../common/telemetry/telemetry.port';
import type { ApiEnvConfig } from '../config/env.schema';
import type {
  OtpStore,
  SessionRepository,
} from '../modules/auth/auth-storage.ports';

type ThrottleRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

const THROTTLE_LUA_SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttlMs = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockMs = tonumber(ARGV[3])

local blockTtl = redis.call('PTTL', blockKey)
if blockTtl > 0 then
  local hits = tonumber(redis.call('GET', hitsKey) or '0')
  return { hits, math.ceil(ttlMs / 1000), 1, math.ceil(blockTtl / 1000) }
end

local hits = redis.call('INCR', hitsKey)
if hits == 1 then
  redis.call('PEXPIRE', hitsKey, ttlMs)
end

local currentTtl = redis.call('PTTL', hitsKey)
if currentTtl < 0 then
  redis.call('PEXPIRE', hitsKey, ttlMs)
  currentTtl = ttlMs
end

if hits > limit and blockMs > 0 then
  redis.call('SET', blockKey, '1', 'PX', blockMs)
  return { hits, math.ceil(currentTtl / 1000), 1, math.ceil(blockMs / 1000) }
end

return { hits, math.ceil(currentTtl / 1000), 0, 0 }
`;

const INCR_WITH_TTL_LUA_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 or redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current
`;

@Injectable()
export class RedisService
  implements SessionRepository, OtpStore, OnModuleDestroy
{
  private readonly client: Redis;

  constructor(
    config: ConfigService<ApiEnvConfig, true>,
    @Optional()
    @Inject(TELEMETRY_METRICS_PORT)
    private readonly telemetry?: TelemetryMetricsPort,
  ) {
    const redisUrl = config.get('REDIS_URL', { infer: true });
    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: HEALTH_PROBE_TIMEOUT_MS,
      commandTimeout: HEALTH_PROBE_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      ...(redisUrl.startsWith('rediss://') ? { tls: {} } : {}),
    });

    this.client.on('error', () => undefined);
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

  async getString(key: string): Promise<string | null> {
    return this.traceRedis('get', async () => {
      await this.ensureConnected();
      return this.client.get(key);
    });
  }

  async setStringEx(
    key: string,
    ttlSeconds: number,
    value: string,
  ): Promise<void> {
    await this.traceRedis('setex', async () => {
      await this.ensureConnected();
      await this.client.set(key, value, 'EX', ttlSeconds);
    });
  }

  async setStringNxEx(
    key: string,
    ttlSeconds: number,
    value: string,
  ): Promise<boolean> {
    return this.traceRedis('setnx', async () => {
      await this.ensureConnected();
      const res = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    });
  }

  async delKeys(...keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }
    return this.traceRedis('del', async () => {
      await this.ensureConnected();
      return this.client.del(...keys);
    });
  }

  async consumeString(key: string): Promise<string | null> {
    return this.traceRedis('getdel', async () => {
      await this.ensureConnected();
      return this.client.getdel(key);
    });
  }

  async consumeJson<T>(key: string): Promise<T | null> {
    const raw = await this.consumeString(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  }

  async addToSetWithTtl(
    key: string,
    member: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.ensureConnected();
    const pipeline = this.client.multi();
    pipeline.sadd(key, member);
    pipeline.expire(key, ttlSeconds);
    await pipeline.exec();
  }

  async getSetMembers(key: string): Promise<string[]> {
    await this.ensureConnected();
    return this.client.smembers(key);
  }

  async removeSetMembers(key: string, ...members: string[]): Promise<void> {
    if (members.length === 0) {
      return;
    }
    await this.ensureConnected();
    await this.client.srem(key, ...members);
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

  async releaseIdempotencyLock(
    consumerGroup: string,
    eventId: string,
  ): Promise<void> {
    await this.delKeys(`idemp:${consumerGroup}:${eventId}`);
  }

  async incrementCounterWithTtl(
    key: string,
    ttlSeconds: number,
  ): Promise<number> {
    return this.traceRedis('eval.incr_ttl', async () => {
      await this.ensureConnected();
      const rawResult = await this.client.eval(
        INCR_WITH_TTL_LUA_SCRIPT,
        1,
        key,
        String(Math.max(1, ttlSeconds)),
      );
      return Number(rawResult ?? 1);
    });
  }

  private traceRedis<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    if (!this.telemetry) {
      return fn();
    }
    return this.telemetry.withSpan(
      `redis.${operation}`,
      { 'db.system': 'redis', 'db.operation.name': operation },
      fn,
    );
  }

  async incrementThrottle(
    key: string,
    ttlMs: number,
    limit: number,
    blockDurationMs: number,
  ): Promise<ThrottleRecord> {
    await this.ensureConnected();
    const rawResult = (await this.client.eval(
      THROTTLE_LUA_SCRIPT,
      2,
      `rl:hits:${key}`,
      `rl:block:${key}`,
      String(Math.max(1000, ttlMs)),
      String(limit),
      String(Math.max(0, blockDurationMs)),
    )) as [number, number, number, number];

    return {
      totalHits: Number(rawResult[0] ?? 1),
      timeToExpire: Number(rawResult[1] ?? Math.ceil(ttlMs / 1000)),
      isBlocked: Number(rawResult[2] ?? 0) === 1,
      timeToBlockExpire: Number(rawResult[3] ?? 0),
    };
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
