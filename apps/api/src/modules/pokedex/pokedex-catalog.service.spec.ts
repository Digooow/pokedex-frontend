import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { TelemetryMetricsPort } from '../../common/telemetry/telemetry.port';
import type { ApiEnvConfig } from '../../config/env.schema';
import type { RedisService } from '../../infra/redis.service';
import { PokeApiCacheService } from './pokeapi-cache.service';
import { PokeApiHttpCacheClient } from './pokeapi-http-cache.client';
import { PokedexCatalogService } from './pokedex-catalog.service';

jest.mock('node:dns/promises', () => ({
  lookup: jest
    .fn()
    .mockResolvedValue([{ address: '104.26.10.233', family: 4 }]),
}));

function extractFetchUrl(input: string | URL | Request): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

const GRAPHQL_CATALOG_FIXTURE = {
  data: {
    pokemon: [
      {
        id: 25,
        name: 'pikachu',
        is_default: true,
        pokemontypes: [{ slot: 1, type: { name: 'electric' } }],
        pokemonstats: [
          { base_stat: 35 },
          { base_stat: 55 },
          { base_stat: 40 },
          { base_stat: 50 },
          { base_stat: 50 },
          { base_stat: 90 },
        ],
        pokemonspecy: {
          generation_id: 1,
          is_legendary: false,
          is_mythical: false,
          is_baby: false,
          pokemonhabitat: { name: 'forest' },
          pokemoncolor: { name: 'yellow' },
          pokemonshape: { name: 'quadruped' },
        },
      },
    ],
  },
};

const GRAPHQL_META_FIXTURE = {
  data: {
    generation: [{ id: 1, name: 'generation-i', region: { name: 'kanto' } }],
    pokemonhabitat: [{ id: 2, name: 'forest' }],
    pokemoncolor: [{ id: 10, name: 'yellow' }],
    pokemonshape: [{ id: 8, name: 'quadruped' }],
    egggroup: [{ id: 5, name: 'ground' }],
    growthrate: [{ id: 2, name: 'medium' }],
    region: [{ id: 1, name: 'kanto' }],
    type: [
      { id: 13, name: 'electric' },
      { id: 19, name: 'stellar' },
      { id: 10001, name: 'unknown' },
      { id: 10002, name: 'shadow' },
    ],
  },
};

const REST_CATALOG_FIXTURE = {
  count: 2,
  results: [
    { name: 'bulbasaur', url: 'https://pokeapi.co/api/v2/pokemon/1/' },
    { name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon/25/' },
  ],
};

function createServiceSetup() {
  const store = new Map<string, unknown>();
  const redis = {
    getJson: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setJsonEx: jest.fn((key: string, _ttl: number, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
  } as unknown as RedisService;

  const config = {
    get: jest.fn((key: keyof ApiEnvConfig) =>
      key === 'POKEAPI_TIMEOUT_MS' ? 3000 : '',
    ),
  } as unknown as ConfigService<ApiEnvConfig, true>;

  const recordCacheOutcome = jest.fn();
  const telemetry = {
    recordCacheOutcome,
  } as unknown as TelemetryMetricsPort;

  const httpCache = new PokeApiHttpCacheClient(
    redis,
    config,
    new StructuredLoggerService(),
    telemetry,
  );
  const pokeApiCache = new PokeApiCacheService(httpCache);
  const service = new PokedexCatalogService(httpCache, pokeApiCache);

  return { store, redis, service, recordCacheOutcome };
}

describe('PokedexCatalogService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('serves /catalog/enriched via GraphQL, deduplicates inflight calls, and hits Redis cache', async () => {
    const { store, service, recordCacheOutcome } = createServiceSetup();
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(GRAPHQL_CATALOG_FIXTURE), { status: 200 }),
      );

    const [first, second] = await Promise.all([
      service.getEnrichedCatalog(),
      service.getEnrichedCatalog(),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      cache: 'miss',
      source: 'graphql',
      degraded: false,
      count: 1,
      items: [
        {
          id: 25,
          name: 'pikachu',
          isDefault: true,
          types: ['electric'],
          generation: 1,
          habitat: 'forest',
          color: 'yellow',
          shape: 'quadruped',
          baseStatTotal: 320,
        },
      ],
    });
    expect(second.cache).toBe('miss');
    expect(store.has('pokeapi:v2:catalog:enriched')).toBe(true);
    expect(store.has('pokeapi:v2:catalog:enriched:stale')).toBe(true);

    const hit = await service.getEnrichedCatalog();
    expect(hit.cache).toBe('hit');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(recordCacheOutcome).toHaveBeenCalledWith('miss');
    expect(recordCacheOutcome).toHaveBeenCalledWith('hit');
  });

  it('serves stale-fallback when GraphQL fails and :stale exists', async () => {
    const { store, service } = createServiceSetup();
    store.set('pokeapi:v2:catalog:enriched:stale', {
      source: 'graphql',
      degraded: false,
      count: 1,
      items: [
        {
          id: 25,
          name: 'pikachu',
          isDefault: true,
          types: ['electric'],
          generation: 1,
          habitat: 'forest',
          color: 'yellow',
          shape: 'quadruped',
          isLegendary: false,
          isMythical: false,
          isBaby: false,
          baseStatTotal: 320,
        },
      ],
    });

    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('GraphQL down', { status: 503 }));

    const result = await service.getEnrichedCatalog();
    expect(result).toMatchObject({
      cache: 'stale-fallback',
      source: 'graphql',
      degraded: false,
      count: 1,
    });
  });

  it('falls back to REST catalog without poisoning enriched cache when GraphQL returns errors on cold cache', async () => {
    const { store, service } = createServiceSetup();
    jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = extractFetchUrl(input);
      if (new URL(url).hostname === 'graphql.pokeapi.co') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ errors: [{ message: 'Query error' }] }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(REST_CATALOG_FIXTURE), { status: 200 }),
      );
    });

    const result = await service.getEnrichedCatalog();
    expect(result).toMatchObject({
      cache: 'miss',
      source: 'rest-fallback',
      degraded: true,
      count: 2,
      items: [
        { id: 1, name: 'bulbasaur', baseStatTotal: 0 },
        { id: 25, name: 'pikachu', baseStatTotal: 0 },
      ],
    });
    expect(store.has('pokeapi:v2:catalog:enriched')).toBe(false);
    expect(store.has('pokeapi:v2:catalog:enriched:stale')).toBe(false);
    expect(store.has('pokeapi:v2:catalog')).toBe(true);
  });

  it('throws ServiceUnavailableException when both GraphQL and REST fail with cold cache', async () => {
    const { service } = createServiceSetup();
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('All down', { status: 503 }));

    await expect(service.getEnrichedCatalog()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('serves /meta/filters via GraphQL filtering out non-standard types and caches for 7d/14d', async () => {
    const { store, service } = createServiceSetup();
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(GRAPHQL_META_FIXTURE), { status: 200 }),
      );

    const miss = await service.getMetaFilters();
    expect(miss.cache).toBe('miss');
    expect(miss.filters.types).toEqual([{ id: 13, name: 'electric' }]);
    expect(miss.filters.generations[0]).toEqual({
      id: 1,
      name: 'generation-i',
      regionName: 'kanto',
    });
    expect(store.has('pokeapi:v2:meta:filters')).toBe(true);
    expect(store.has('pokeapi:v2:meta:filters:stale')).toBe(true);

    const hit = await service.getMetaFilters();
    expect(hit.cache).toBe('hit');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to 8 REST metadata lists or :stale for /meta/filters', async () => {
    const { store, service } = createServiceSetup();
    jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const parsed = new URL(extractFetchUrl(input));
      if (parsed.hostname === 'graphql.pokeapi.co') {
        return Promise.resolve(new Response('GraphQL down', { status: 503 }));
      }
      const resource = parsed.pathname.split('/').pop() ?? '';
      const fixtures: Readonly<Record<string, unknown>> = {
        generation: {
          count: 1,
          results: [
            {
              name: 'generation-i',
              url: 'https://pokeapi.co/api/v2/generation/1/',
            },
          ],
        },
        'pokemon-habitat': {
          count: 1,
          results: [
            {
              name: 'forest',
              url: 'https://pokeapi.co/api/v2/pokemon-habitat/2/',
            },
          ],
        },
        'pokemon-color': {
          count: 1,
          results: [
            {
              name: 'yellow',
              url: 'https://pokeapi.co/api/v2/pokemon-color/10/',
            },
          ],
        },
        'pokemon-shape': {
          count: 1,
          results: [
            {
              name: 'quadruped',
              url: 'https://pokeapi.co/api/v2/pokemon-shape/8/',
            },
          ],
        },
        'egg-group': {
          count: 1,
          results: [
            { name: 'ground', url: 'https://pokeapi.co/api/v2/egg-group/5/' },
          ],
        },
        'growth-rate': {
          count: 1,
          results: [
            { name: 'medium', url: 'https://pokeapi.co/api/v2/growth-rate/2/' },
          ],
        },
        region: {
          count: 1,
          results: [
            { name: 'kanto', url: 'https://pokeapi.co/api/v2/region/1/' },
          ],
        },
        type: {
          count: 2,
          results: [
            { name: 'electric', url: 'https://pokeapi.co/api/v2/type/13/' },
            { name: 'stellar', url: 'https://pokeapi.co/api/v2/type/19/' },
          ],
        },
      };
      return Promise.resolve(
        new Response(JSON.stringify(fixtures[resource]), { status: 200 }),
      );
    });

    const restResult = await service.getMetaFilters();
    expect(restResult.cache).toBe('miss');
    expect(restResult.filters.generations[0]?.regionName).toBe('kanto');
    expect(restResult.filters.types).toEqual([{ id: 13, name: 'electric' }]);

    store.delete('pokeapi:v2:meta:filters');
    for (const key of Array.from(store.keys())) {
      if (key.startsWith('pokeapi:v2:raw:meta-list:')) {
        store.delete(key);
      }
    }
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('All down', { status: 503 }));

    const staleResult = await service.getMetaFilters();
    expect(staleResult.cache).toBe('stale-fallback');
    expect(staleResult.filters.regions).toEqual([{ id: 1, name: 'kanto' }]);
  });
});
