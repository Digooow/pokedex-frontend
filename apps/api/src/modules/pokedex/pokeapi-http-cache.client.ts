import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CacheOutcome } from '@pokeverse/shared';
import { assertSafeOutboundUrl } from '../../common/http/safe-outbound-http';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import {
  TELEMETRY_METRICS_PORT,
  type TelemetryMetricsPort,
} from '../../common/telemetry/telemetry.port';
import type { ApiEnvConfig } from '../../config/env.schema';
import { RedisService } from '../../infra/redis.service';

export const CACHE_TTL_24H_SEC = 86_400;
export const CACHE_STALE_TTL_7D_SEC = 604_800;
export const CACHE_TTL_7D_SEC = 604_800;
export const CACHE_STALE_TTL_14D_SEC = 1_209_600;

const CB_FAILURE_THRESHOLD = 3;
const CB_OPEN_COOLDOWN_MS = 30_000;

export interface CachedResourceResult<T> {
  readonly cache: CacheOutcome;
  readonly data: T;
}

export interface FetchCachedJsonOptions<T> {
  readonly cacheKey: string;
  readonly url: string;
  readonly ttlSec: number;
  readonly staleTtlSec: number;
  readonly notFoundMessage: string;
  readonly parse: (raw: unknown) => T;
  readonly aliasKeys?: (data: T) => readonly string[];
  readonly recordMetrics?: boolean;
}

export interface GetCachedOrComputeOptions<T> {
  readonly cacheKey: string;
  readonly ttlSec: number;
  readonly staleTtlSec: number;
  readonly parse: (raw: unknown) => T;
  readonly compute: () => Promise<T>;
  readonly aliasKeys?: (data: T) => readonly string[];
  readonly recordMetrics?: boolean;
}

@Injectable()
export class PokeApiHttpCacheClient {
  private readonly inflight = new Map<
    string,
    Promise<CachedResourceResult<unknown>>
  >();
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService<ApiEnvConfig, true>,
    private readonly logger: StructuredLoggerService,
    @Optional()
    @Inject(TELEMETRY_METRICS_PORT)
    private readonly telemetry?: TelemetryMetricsPort,
  ) {}

  fetchCachedJson<T>(
    options: FetchCachedJsonOptions<T>,
  ): Promise<CachedResourceResult<T>> {
    return this.getCachedOrCompute({
      cacheKey: options.cacheKey,
      ttlSec: options.ttlSec,
      staleTtlSec: options.staleTtlSec,
      parse: options.parse,
      aliasKeys: options.aliasKeys,
      recordMetrics: options.recordMetrics,
      compute: async () => {
        const raw = await this.fetchUpstreamJson(
          options.url,
          options.notFoundMessage,
        );
        try {
          return options.parse(raw);
        } catch {
          throw new ServiceUnavailableException(
            'Resposta inesperada da PokéAPI upstream.',
          );
        }
      },
    });
  }

  async getCachedOrCompute<T>(
    options: GetCachedOrComputeOptions<T>,
  ): Promise<CachedResourceResult<T>> {
    const emitMetrics = options.recordMetrics !== false;
    const cached = await this.safeRedisGet(options.cacheKey, options.parse);
    if (cached !== null) {
      if (emitMetrics) {
        this.telemetry?.recordCacheOutcome('hit');
      }
      return { cache: 'hit', data: cached };
    }

    return this.runSingleflight(options.cacheKey, () =>
      this.computeAndCache(options, emitMetrics),
    );
  }

  private async runSingleflight<T>(
    cacheKey: string,
    producer: () => Promise<CachedResourceResult<T>>,
  ): Promise<CachedResourceResult<T>> {
    const existing = this.inflight.get(cacheKey);
    if (existing) {
      return existing as Promise<CachedResourceResult<T>>;
    }

    const request = producer().finally(() => {
      this.inflight.delete(cacheKey);
    });
    this.inflight.set(cacheKey, request);
    return request;
  }

  private async computeAndCache<T>(
    options: GetCachedOrComputeOptions<T>,
    emitMetrics: boolean,
  ): Promise<CachedResourceResult<T>> {
    try {
      const data = await options.compute();
      await this.persistWithAliases(options, data);
      if (emitMetrics) {
        this.telemetry?.recordCacheOutcome('miss');
      }
      return { cache: 'miss', data };
    } catch (error) {
      if (
        !(error instanceof ServiceUnavailableException) ||
        options.staleTtlSec <= 0
      ) {
        throw error;
      }
      const stale = await this.safeRedisGet(
        `${options.cacheKey}:stale`,
        options.parse,
      );
      if (!stale) {
        throw error;
      }
      if (emitMetrics) {
        this.telemetry?.recordCacheOutcome('stale-fallback');
      }
      return { cache: 'stale-fallback', data: stale };
    }
  }

  private async persistWithAliases<T>(
    options: GetCachedOrComputeOptions<T>,
    data: T,
  ): Promise<void> {
    await this.safeRedisSet(
      options.cacheKey,
      options.ttlSec,
      options.staleTtlSec,
      data,
    );
    if (!options.aliasKeys) {
      return;
    }

    const aliases = new Set(options.aliasKeys(data));
    for (const aliasKey of aliases) {
      if (aliasKey && aliasKey !== options.cacheKey) {
        await this.safeRedisSet(
          aliasKey,
          options.ttlSec,
          options.staleTtlSec,
          data,
        );
      }
    }
  }

  private async fetchUpstreamJson(
    url: string,
    notFoundMessage: string,
  ): Promise<unknown> {
    if (Date.now() < this.circuitOpenUntil) {
      throw new ServiceUnavailableException(
        'PokéAPI temporariamente protegida por Circuit Breaker. Tente em instantes.',
      );
    }

    const timeoutMs = this.config.get('POKEAPI_TIMEOUT_MS', { infer: true });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const safeUrl = await assertSafeOutboundUrl(url, ['pokeapi.co']);
      const response = await fetch(safeUrl.toString(), {
        signal: controller.signal,
        redirect: 'error',
        headers: { accept: 'application/json' },
      });

      if (response.status === 404) {
        this.consecutiveFailures = 0;
        throw new NotFoundException(notFoundMessage);
      }
      if (!response.ok) {
        throw new ServiceUnavailableException(
          `PokéAPI retornou HTTP ${response.status}.`,
        );
      }

      this.consecutiveFailures = 0;
      this.circuitOpenUntil = 0;
      return (await response.json()) as unknown;
    } catch (error) {
      throw this.handleUpstreamError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  private handleUpstreamError(error: unknown): Error {
    if (error instanceof NotFoundException) {
      return error;
    }

    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= CB_FAILURE_THRESHOLD) {
      this.circuitOpenUntil = Date.now() + CB_OPEN_COOLDOWN_MS;
      this.logger.emitEvent(
        'warn',
        'Circuit breaker opened for PokéAPI upstream',
        {
          context: PokeApiHttpCacheClient.name,
          errorCode: 'POKEAPI_CIRCUIT_OPEN',
        },
      );
    }

    if (error instanceof ServiceUnavailableException) {
      return error;
    }
    return new ServiceUnavailableException(
      'Falha de comunicação com a PokéAPI externa.',
    );
  }

  private async safeRedisGet<T>(
    key: string,
    parse: (raw: unknown) => T,
  ): Promise<T | null> {
    try {
      const raw = await this.redis.getJson<unknown>(key);
      if (!raw) {
        return null;
      }
      return parse(raw);
    } catch {
      return null;
    }
  }

  private async safeRedisSet(
    key: string,
    ttlSec: number,
    staleTtlSec: number,
    value: unknown,
  ): Promise<void> {
    try {
      await this.redis.setJsonEx(key, ttlSec, value);
      if (staleTtlSec > 0) {
        await this.redis.setJsonEx(`${key}:stale`, staleTtlSec, value);
      }
    } catch {
      return;
    }
  }
}
