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
import { UpstreamCircuitBreaker } from './upstream-circuit-breaker';

export const CACHE_TTL_24H_SEC = 86_400;
export const CACHE_STALE_TTL_7D_SEC = 604_800;
export const CACHE_TTL_7D_SEC = 604_800;
export const CACHE_STALE_TTL_14D_SEC = 1_209_600;

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
  private readonly circuitBreaker = new UpstreamCircuitBreaker();

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
      ...options,
      compute: async () => {
        const raw = await this.executeUpstreamRequest(
          options.url,
          { method: 'GET', headers: { accept: 'application/json' } },
          ['pokeapi.co'],
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
    const cached = await this.readFreshCache(options.cacheKey, options.parse);
    if (cached !== null) {
      if (emitMetrics) {
        this.recordCacheMetric('hit');
      }
      return { cache: 'hit', data: cached };
    }
    return this.runSingleflight(options.cacheKey, () =>
      this.computeAndCache(options, emitMetrics),
    );
  }

  readFreshCache<T>(
    key: string,
    parse: (raw: unknown) => T,
  ): Promise<T | null> {
    return this.safeRedisGet(key, parse);
  }

  readStaleCache<T>(
    key: string,
    parse: (raw: unknown) => T,
  ): Promise<T | null> {
    return this.safeRedisGet(`${key}:stale`, parse);
  }

  writeCache(
    key: string,
    ttlSec: number,
    staleTtlSec: number,
    value: unknown,
  ): Promise<void> {
    return this.safeRedisSet(key, ttlSec, staleTtlSec, value);
  }

  recordCacheMetric(outcome: CacheOutcome): void {
    this.telemetry?.recordCacheOutcome(outcome);
  }

  async runSingleflight<T>(
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

  postUpstreamJson(
    url: string,
    body: unknown,
    allowedHosts: readonly string[],
  ): Promise<unknown> {
    return this.executeUpstreamRequest(
      url,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      allowedHosts,
      'Recurso não encontrado na PokéAPI.',
    );
  }

  private async executeUpstreamRequest(
    url: string,
    init: Omit<RequestInit, 'signal' | 'redirect'>,
    allowedHosts: readonly string[],
    notFoundMessage: string,
  ): Promise<unknown> {
    let targetHost = this.extractHostname(url) || 'pokeapi.co';
    if (this.circuitBreaker.isOpen(targetHost)) {
      throw new ServiceUnavailableException(
        'PokéAPI temporariamente protegida por Circuit Breaker. Tente em instantes.',
      );
    }

    const timeoutMs = this.config.get('POKEAPI_TIMEOUT_MS', { infer: true });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const host = targetHost;
    try {
      const safeUrl = await assertSafeOutboundUrl(url, allowedHosts);
      targetHost = safeUrl.hostname.toLowerCase();
      if (targetHost !== host && this.circuitBreaker.isOpen(targetHost)) {
        throw new ServiceUnavailableException(
          'PokéAPI temporariamente protegida por Circuit Breaker. Tente em instantes.',
        );
      }
      const response = await fetch(safeUrl.toString(), {
        ...init,
        signal: controller.signal,
        redirect: 'error',
      });
      if (response.status === 404) {
        this.circuitBreaker.recordSuccess(targetHost);
        throw new NotFoundException(notFoundMessage);
      }
      if (!response.ok) {
        throw new ServiceUnavailableException(
          `PokéAPI retornou HTTP ${response.status}.`,
        );
      }
      this.circuitBreaker.recordSuccess(targetHost);
      return (await response.json()) as unknown;
    } catch (error) {
      throw this.handleUpstreamError(targetHost, error);
    } finally {
      clearTimeout(timer);
    }
  }

  private extractHostname(rawUrl: string): string {
    try {
      return new URL(rawUrl).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  private async computeAndCache<T>(
    options: GetCachedOrComputeOptions<T>,
    emitMetrics: boolean,
  ): Promise<CachedResourceResult<T>> {
    try {
      const data = await options.compute();
      await this.persistWithAliases(options, data);
      if (emitMetrics) this.recordCacheMetric('miss');
      return { cache: 'miss', data };
    } catch (error) {
      const isRecoverable =
        error instanceof ServiceUnavailableException && options.staleTtlSec > 0;
      if (!isRecoverable) throw error;
      const stale = await this.readStaleCache(options.cacheKey, options.parse);
      if (!stale) throw error;
      if (emitMetrics) this.recordCacheMetric('stale-fallback');
      return { cache: 'stale-fallback', data: stale };
    }
  }

  private async persistWithAliases<T>(
    options: GetCachedOrComputeOptions<T>,
    data: T,
  ): Promise<void> {
    const { cacheKey, ttlSec, staleTtlSec, aliasKeys } = options;
    await this.writeCache(cacheKey, ttlSec, staleTtlSec, data);
    if (!aliasKeys) {
      return;
    }
    for (const aliasKey of new Set(aliasKeys(data))) {
      if (aliasKey && aliasKey !== cacheKey) {
        await this.writeCache(aliasKey, ttlSec, staleTtlSec, data);
      }
    }
  }

  private handleUpstreamError(host: string, error: unknown): Error {
    if (error instanceof NotFoundException) {
      return error;
    }
    if (this.circuitBreaker.recordFailure(host)) {
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
      return raw ? parse(raw) : null;
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
