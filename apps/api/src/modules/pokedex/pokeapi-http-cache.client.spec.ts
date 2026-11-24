import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { TelemetryMetricsPort } from '../../common/telemetry/telemetry.port';
import type { ApiEnvConfig } from '../../config/env.schema';
import type { RedisService } from '../../infra/redis.service';
import {
  CACHE_STALE_TTL_14D_SEC,
  CACHE_STALE_TTL_7D_SEC,
  CACHE_TTL_24H_SEC,
  CACHE_TTL_7D_SEC,
  PokeApiHttpCacheClient,
} from './pokeapi-http-cache.client';

jest.mock('node:dns/promises', () => ({
  lookup: jest
    .fn()
    .mockResolvedValue([{ address: '104.26.10.233', family: 4 }]),
}));

function createConfigMock(): ConfigService<ApiEnvConfig, true> {
  return {
    get: jest.fn((key: keyof ApiEnvConfig) =>
      key === 'POKEAPI_TIMEOUT_MS' ? 3000 : '',
    ),
  } as unknown as ConfigService<ApiEnvConfig, true>;
}

function createRedisMemoryMock() {
  const store = new Map<string, unknown>();
  const setJsonEx = jest.fn((key: string, _ttl: number, value: unknown) => {
    store.set(key, value);
    return Promise.resolve();
  });
  const getJson = jest.fn((key: string) =>
    Promise.resolve(store.get(key) ?? null),
  );
  const redis = { getJson, setJsonEx } as unknown as RedisService;
  return { store, setJsonEx, getJson, redis };
}

describe('PokeApiHttpCacheClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('caches upstream JSON with primary, stale, and alias keys and deduplicates inflight requests', async () => {
    const { setJsonEx, redis } = createRedisMemoryMock();
    const recordCacheOutcome = jest.fn();
    const telemetry = {
      recordCacheOutcome,
    } as unknown as TelemetryMetricsPort;

    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 10, name: 'fire' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const client = new PokeApiHttpCacheClient(
      redis,
      createConfigMock(),
      new StructuredLoggerService(),
      telemetry,
    );

    const options = {
      cacheKey: 'pokeapi:v2:raw:type:fire',
      url: 'https://pokeapi.co/api/v2/type/fire',
      ttlSec: CACHE_TTL_7D_SEC,
      staleTtlSec: CACHE_STALE_TTL_14D_SEC,
      notFoundMessage: 'Not found',
      parse: (raw: unknown) => raw as { id: number; name: string },
      aliasKeys: (item: { id: number; name: string }) => [
        `pokeapi:v2:raw:type:${item.id}`,
      ],
    };

    const [first, second] = await Promise.all([
      client.fetchCachedJson(options),
      client.fetchCachedJson(options),
    ]);

    expect(first).toEqual({ cache: 'miss', data: { id: 10, name: 'fire' } });
    expect(second).toEqual({ cache: 'miss', data: { id: 10, name: 'fire' } });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(setJsonEx).toHaveBeenCalledWith(
      'pokeapi:v2:raw:type:fire',
      CACHE_TTL_7D_SEC,
      { id: 10, name: 'fire' },
    );
    expect(setJsonEx).toHaveBeenCalledWith(
      'pokeapi:v2:raw:type:fire:stale',
      CACHE_STALE_TTL_14D_SEC,
      { id: 10, name: 'fire' },
    );
    expect(setJsonEx).toHaveBeenCalledWith(
      'pokeapi:v2:raw:type:10',
      CACHE_TTL_7D_SEC,
      { id: 10, name: 'fire' },
    );

    const hit = await client.fetchCachedJson(options);
    expect(hit.cache).toBe('hit');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(recordCacheOutcome).toHaveBeenCalledWith('miss');
    expect(recordCacheOutcome).toHaveBeenCalledWith('hit');
  });

  it('does not open Circuit Breaker on 404 responses and opens after 3 consecutive upstream errors', async () => {
    const { store, redis } = createRedisMemoryMock();
    store.set('pokeapi:v2:bundle:pikachu:stale', { id: 25 });

    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('Not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('Not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('Upstream down', { status: 503 }))
      .mockResolvedValueOnce(new Response('Upstream down', { status: 503 }))
      .mockResolvedValueOnce(new Response('Upstream down', { status: 503 }));

    const client = new PokeApiHttpCacheClient(
      redis,
      createConfigMock(),
      new StructuredLoggerService(),
    );

    const parseId = (raw: unknown) => raw as { id: number };
    for (const slug of ['missing-1', 'missing-2', 'missing-3']) {
      await expect(
        client.fetchCachedJson({
          cacheKey: `pokeapi:v2:raw:${slug}`,
          url: `https://pokeapi.co/api/v2/pokemon/${slug}`,
          ttlSec: CACHE_TTL_24H_SEC,
          staleTtlSec: CACHE_STALE_TTL_7D_SEC,
          notFoundMessage: 'Missing Pokémon',
          parse: parseId,
        }),
      ).rejects.toThrow(NotFoundException);
    }

    const staleBundle = await client.getCachedOrCompute({
      cacheKey: 'pokeapi:v2:bundle:pikachu',
      ttlSec: CACHE_TTL_24H_SEC,
      staleTtlSec: CACHE_STALE_TTL_7D_SEC,
      parse: parseId,
      compute: () =>
        client
          .fetchCachedJson({
            cacheKey: 'pokeapi:v2:raw:pokemon:pikachu',
            url: 'https://pokeapi.co/api/v2/pokemon/pikachu',
            ttlSec: CACHE_TTL_24H_SEC,
            staleTtlSec: CACHE_STALE_TTL_7D_SEC,
            notFoundMessage: 'Missing',
            parse: parseId,
            recordMetrics: false,
          })
          .then((res) => res.data),
    });
    expect(staleBundle).toEqual({ cache: 'stale-fallback', data: { id: 25 } });

    await expect(
      client.fetchCachedJson({
        cacheKey: 'pokeapi:v2:raw:pokemon:eevee',
        url: 'https://pokeapi.co/api/v2/pokemon/eevee',
        ttlSec: CACHE_TTL_24H_SEC,
        staleTtlSec: CACHE_STALE_TTL_7D_SEC,
        notFoundMessage: 'Missing',
        parse: parseId,
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    await expect(
      client.fetchCachedJson({
        cacheKey: 'pokeapi:v2:raw:pokemon:snorlax',
        url: 'https://pokeapi.co/api/v2/pokemon/snorlax',
        ttlSec: CACHE_TTL_24H_SEC,
        staleTtlSec: CACHE_STALE_TTL_7D_SEC,
        notFoundMessage: 'Missing',
        parse: parseId,
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    const callsBeforeOpen = fetchSpy.mock.calls.length;
    await expect(
      client.fetchCachedJson({
        cacheKey: 'pokeapi:v2:raw:pokemon:mew',
        url: 'https://pokeapi.co/api/v2/pokemon/mew',
        ttlSec: CACHE_TTL_24H_SEC,
        staleTtlSec: CACHE_STALE_TTL_7D_SEC,
        notFoundMessage: 'Missing',
        parse: parseId,
      }),
    ).rejects.toThrow('Circuit Breaker');
    expect(fetchSpy).toHaveBeenCalledTimes(callsBeforeOpen);
  });

  it('isolates Circuit Breaker state per host between graphql.pokeapi.co and pokeapi.co', async () => {
    const { redis } = createRedisMemoryMock();
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (new URL(url).hostname === 'graphql.pokeapi.co') {
          return Promise.resolve(new Response('GraphQL down', { status: 503 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ id: 25, name: 'pikachu' }), {
            status: 200,
          }),
        );
      });

    const client = new PokeApiHttpCacheClient(
      redis,
      createConfigMock(),
      new StructuredLoggerService(),
    );

    for (let i = 0; i < 3; i += 1) {
      await expect(
        client.postUpstreamJson(
          'https://graphql.pokeapi.co/v1beta2',
          { query: '{ pokemon { id } }' },
          ['graphql.pokeapi.co'],
        ),
      ).rejects.toThrow(ServiceUnavailableException);
    }

    const callsWhenGraphQlOpened = fetchSpy.mock.calls.length;
    await expect(
      client.postUpstreamJson(
        'https://graphql.pokeapi.co/v1beta2',
        { query: '{ pokemon { id } }' },
        ['graphql.pokeapi.co'],
      ),
    ).rejects.toThrow('Circuit Breaker');
    expect(fetchSpy).toHaveBeenCalledTimes(callsWhenGraphQlOpened);

    const restResult = await client.fetchCachedJson({
      cacheKey: 'pokeapi:v2:raw:pokemon:pikachu',
      url: 'https://pokeapi.co/api/v2/pokemon/pikachu',
      ttlSec: CACHE_TTL_24H_SEC,
      staleTtlSec: CACHE_STALE_TTL_7D_SEC,
      notFoundMessage: 'Missing',
      parse: (raw) => raw as { id: number; name: string },
    });

    expect(restResult).toEqual({
      cache: 'miss',
      data: { id: 25, name: 'pikachu' },
    });
  });
});
