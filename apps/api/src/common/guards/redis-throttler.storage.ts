import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from '../../infra/redis.service';
import { StructuredLoggerService } from '../telemetry/structured-logger.service';

type ThrottleRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(
    private readonly redis: RedisService,
    private readonly logger: StructuredLoggerService,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottleRecord> {
    try {
      return await this.redis.incrementThrottle(
        `${throttlerName}:${key}`,
        ttl,
        limit,
        blockDuration,
      );
    } catch (error) {
      this.logger.emitEvent(
        'warn',
        `Redis throttle storage unavailable, allowing request: ${String(error)}`,
        {
          context: RedisThrottlerStorage.name,
          errorCode: 'REDIS_THROTTLE_DEGRADED',
        },
      );
      return {
        totalHits: 1,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
