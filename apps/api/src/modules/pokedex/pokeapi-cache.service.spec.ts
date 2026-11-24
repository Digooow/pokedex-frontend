import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import type { RedisService } from '../../infra/redis.service';
import { PokeApiCacheService } from './pokeapi-cache.service';
import { PokeApiHttpCacheClient } from './pokeapi-http-cache.client';

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

const SAMPLE_PIKACHU_DTO = {
  id: 25,
  name: 'pikachu',
  height: 4,
  weight: 60,
  types: [
    {
      slot: 1,
      type: { name: 'electric', url: 'https://pokeapi.co/api/v2/type/13/' },
    },
  ],
  abilities: [
    {
      is_hidden: false,
      slot: 1,
      ability: { name: 'static', url: 'https://pokeapi.co/api/v2/ability/9/' },
    },
  ],
  stats: [
    {
      base_stat: 35,
      effort: 0,
      stat: { name: 'hp', url: 'https://pokeapi.co/api/v2/stat/1/' },
    },
  ],
  sprites: {
    front_default:
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
  },
};

const SAMPLE_CATALOG_DTO = {
  count: 1,
  results: [{ name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon/25/' }],
};

describe('PokeApiCacheService (Redis cache, stale-fallback & Circuit Breaker)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects invalid Pokémon identifiers before hitting Redis or PokéAPI', async () => {
    const redisMock = {
      getJson: jest.fn(),
      setJsonEx: jest.fn(),
    } as unknown as RedisService;

    const client = new PokeApiHttpCacheClient(
      redisMock,
      createConfigMock(),
      new StructuredLoggerService(),
    );
    const service = new PokeApiCacheService(client);

    await expect(service.getPokemon('../etc/passwd')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.getPokemon('   ')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns cached Pokémon on Redis hit and populates Redis + stale backup on miss', async () => {
    const store = new Map<string, unknown>();
    const setJsonEx = jest.fn((key: string, _ttl: number, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    });
    const redisMock = {
      getJson: jest.fn((key: string) =>
        Promise.resolve(store.get(key) ?? null),
      ),
      setJsonEx,
    } as unknown as RedisService;

    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_PIKACHU_DTO), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = new PokeApiHttpCacheClient(
      redisMock,
      createConfigMock(),
      new StructuredLoggerService(),
    );
    const service = new PokeApiCacheService(client);

    const missResult = await service.getPokemon('Pikachu');
    expect(missResult.cache).toBe('miss');
    expect(missResult.pokemon.id).toBe(25);
    expect(setJsonEx).toHaveBeenCalledWith(
      'pokeapi:v2:pokemon:pikachu',
      86_400,
      expect.objectContaining({ id: 25 }),
    );
    expect(setJsonEx).toHaveBeenCalledWith(
      'pokeapi:v2:pokemon:pikachu:stale',
      604_800,
      expect.objectContaining({ id: 25 }),
    );
    expect(setJsonEx).toHaveBeenCalledWith(
      'pokeapi:v2:pokemon:25',
      86_400,
      expect.objectContaining({ name: 'pikachu' }),
    );

    const hitResult = await service.getPokemon('pikachu');
    expect(hitResult.cache).toBe('hit');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('serves stale-fallback on upstream 503 and opens Circuit Breaker after 3 consecutive failures', async () => {
    const store = new Map<string, unknown>([
      ['pokeapi:v2:catalog:stale', SAMPLE_CATALOG_DTO],
    ]);
    const redisMock = {
      getJson: jest.fn((key: string) =>
        Promise.resolve(store.get(key) ?? null),
      ),
      setJsonEx: jest.fn().mockResolvedValue(undefined),
    } as unknown as RedisService;

    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response('Upstream down', { status: 503 })),
      );

    const client = new PokeApiHttpCacheClient(
      redisMock,
      createConfigMock(),
      new StructuredLoggerService(),
    );
    const service = new PokeApiCacheService(client);

    const staleCatalog = await service.getCatalog();
    expect(staleCatalog.cache).toBe('stale-fallback');
    expect(staleCatalog.catalog.results[0]?.name).toBe('pikachu');

    await expect(service.getPokemon('charizard')).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(service.getPokemon('blastoise')).rejects.toThrow(
      ServiceUnavailableException,
    );

    const callsBeforeOpen = fetchSpy.mock.calls.length;
    await expect(service.getPokemon('venusaur')).rejects.toThrow(
      'Circuit Breaker',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(callsBeforeOpen);
  });
});
