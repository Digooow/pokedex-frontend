import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import type { RedisService } from '../../infra/redis.service';
import {
  RAW_ADAMANT_NATURE,
  RAW_CHERI_BERRY,
  RAW_ELECTRIC_FULL_TYPE,
  RAW_FAIRY_EGG_GROUP,
  RAW_GEN9_MOVE_NULL_META,
  RAW_HARDY_NATURE,
  RAW_HISUI_REGION,
  RAW_KANTO_POKEDEX,
  RAW_KANTO_REGION,
  RAW_LIGHT_BALL_ITEM,
  RAW_MEDIUM_GROWTH_RATE,
  RAW_MOVE_INDEX,
  RAW_NATURE_INDEX,
  RAW_STATIC_ABILITY,
  RAW_THUNDERBOLT,
  RAW_TYPE_INDEX,
  RAW_VIRIDIAN_LOCATION,
} from '../../testing/pokeapi-encyclopedia.fixtures';
import { PokeApiHttpCacheClient } from './pokeapi-http-cache.client';
import { PokedexEncyclopediaService } from './pokedex-encyclopedia.service';

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn().mockResolvedValue([{ address: '2001:db8::1', family: 6 }]),
}));

function resolveFetchUrl(input: string | URL | Request): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

function createHarness() {
  const store = new Map<string, unknown>();
  const redisMock = {
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

  const client = new PokeApiHttpCacheClient(
    redisMock,
    config,
    new StructuredLoggerService(),
  );
  return { store, service: new PokedexEncyclopediaService(client) };
}

const FIXTURE_ROUTES: Readonly<Record<string, unknown>> = {
  '/move?limit=3000&offset=0': RAW_MOVE_INDEX,
  '/move/thunderbolt': RAW_THUNDERBOLT,
  '/move/tera-blast': RAW_GEN9_MOVE_NULL_META,
  '/ability/static': RAW_STATIC_ABILITY,
  '/item/light-ball': RAW_LIGHT_BALL_ITEM,
  '/berry/cheri': RAW_CHERI_BERRY,
  '/region/kanto': RAW_KANTO_REGION,
  '/region/hisui': RAW_HISUI_REGION,
  '/pokedex/kanto': RAW_KANTO_POKEDEX,
  '/location/viridian-forest': RAW_VIRIDIAN_LOCATION,
  '/egg-group/fairy': RAW_FAIRY_EGG_GROUP,
  '/growth-rate/medium': RAW_MEDIUM_GROWTH_RATE,
  '/nature?limit=100&offset=0': RAW_NATURE_INDEX,
  '/nature/1': RAW_HARDY_NATURE,
  '/nature/11': RAW_ADAMANT_NATURE,
  '/nature/adamant': RAW_ADAMANT_NATURE,
  '/type?limit=100&offset=0': RAW_TYPE_INDEX,
  '/type/13': RAW_ELECTRIC_FULL_TYPE,
  '/type/electric': RAW_ELECTRIC_FULL_TYPE,
};

function createUpstreamMock() {
  return jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const parsed = new URL(resolveFetchUrl(input));
    const key = `${parsed.pathname.replace('/api/v2', '')}${parsed.search}`;
    const payload = FIXTURE_ROUTES[key];
    if (payload) {
      return Promise.resolve(
        new Response(JSON.stringify(payload), { status: 200 }),
      );
    }
    return Promise.resolve(new Response('Not found', { status: 404 }));
  });
}

describe('PokedexEncyclopediaService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('paginates and filters index using a single cached Redis key', async () => {
    const { store, service } = createHarness();
    const fetchSpy = createUpstreamMock();

    const page1 = await service.listResource('move', {
      limit: 2,
      offset: 0,
      q: '',
    });
    expect(page1).toMatchObject({
      cache: 'miss',
      resource: 'move',
      total: 3,
      limit: 2,
      offset: 0,
      hasMore: true,
      items: [
        { id: 1, name: 'pound' },
        { id: 85, name: 'thunderbolt' },
      ],
    });

    const filtered = await service.listResource('move', {
      limit: 10,
      offset: 0,
      q: 'thunder',
    });
    expect(filtered).toMatchObject({
      cache: 'hit',
      total: 2,
      hasMore: false,
      items: [
        { id: 85, name: 'thunderbolt' },
        { id: 86, name: 'thunder-wave' },
      ],
    });

    const byId = await service.listResource('move', {
      limit: 10,
      offset: 0,
      q: '85',
    });
    expect(byId.items).toEqual([{ id: 85, name: 'thunderbolt' }]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(store.has('pokeapi:v2:encyclopedia:index:move')).toBe(true);
    expect(store.has('pokeapi:v2:encyclopedia:index:move:stale')).toBe(true);
  });

  it('fetches details with reverse lookups, $effect_chance interpolation, null meta, and alias hits', async () => {
    const { service } = createHarness();
    const fetchSpy = createUpstreamMock();

    const move = await service.getMove('thunderbolt');
    expect(move.cache).toBe('miss');
    expect(move.move.shortEffect).toBe(
      'Has a 10% chance to paralyze the target.',
    );
    expect(move.move.learnedByPokemon[0]?.pokemonName).toBe('pikachu');

    const moveByIdAlias = await service.getMove('85');
    expect(moveByIdAlias.cache).toBe('hit');
    expect(moveByIdAlias.move.name).toBe('thunderbolt');

    const gen9Move = await service.getMove('tera-blast');
    expect(gen9Move.move.ailment).toBeNull();
    expect(gen9Move.move.category).toBeNull();

    const ability = await service.getAbility('static');
    expect(ability.ability.pokemon[0]).toMatchObject({
      pokemonId: 25,
      pokemonName: 'pikachu',
      isHidden: false,
      slot: 1,
    });

    const item = await service.getItem('light-ball');
    expect(item.item.flavorTexts[0]?.text).toBe('An orb held by Pikachu.');
    expect(item.item.heldByPokemon[0]?.maxRarity).toBe(5);

    const berry = await service.getBerry('cheri');
    expect(berry.berry).toMatchObject({
      itemName: 'cheri-berry',
      itemId: 126,
      naturalGiftType: 'fire',
    });

    const kanto = await service.getRegion('kanto');
    expect(kanto.region.locations).toEqual([
      { id: 67, name: 'viridian-forest' },
    ]);
    const hisui = await service.getRegion('hisui');
    expect(hisui.region.mainGeneration).toBeNull();

    const pokedex = await service.getPokedex('kanto');
    expect(pokedex.pokedex.entries[0]?.speciesName).toBe('pikachu');

    const location = await service.getLocation('viridian-forest');
    expect(location.location.localizedName).toBe('Viridian Forest');
    expect(location.location.generations).toEqual(['generation-i']);

    const eggGroup = await service.getEggGroup('fairy');
    expect(eggGroup.eggGroup.speciesCount).toBe(1);

    const growthRate = await service.getGrowthRate('medium');
    expect(growthRate.growthRate.levels.map((l) => l.level)).toEqual([1, 2]);

    const fetchCountBeforeAliasHit = fetchSpy.mock.calls.length;
    const repeatLocation = await service.getLocation('67');
    expect(repeatLocation.cache).toBe('hit');
    expect(fetchSpy).toHaveBeenCalledTimes(fetchCountBeforeAliasHit);
  });

  it('caches /natures and /types for 7d and serves stale-fallback on upstream 503', async () => {
    const { store, service } = createHarness();
    let failUpstream = false;

    jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (failUpstream) {
        return Promise.resolve(new Response('Upstream down', { status: 503 }));
      }
      const parsed = new URL(resolveFetchUrl(input));
      const key = `${parsed.pathname.replace('/api/v2', '')}${parsed.search}`;
      const payload = FIXTURE_ROUTES[key];
      return payload
        ? Promise.resolve(
            new Response(JSON.stringify(payload), { status: 200 }),
          )
        : Promise.resolve(new Response('Not found', { status: 404 }));
    });

    const naturesMiss = await service.listNatures();
    expect(naturesMiss.cache).toBe('miss');
    expect(naturesMiss.natures[0]?.isNeutral).toBe(true);
    expect(naturesMiss.natures[1]?.isNeutral).toBe(false);

    const typesMiss = await service.listTypes();
    expect(typesMiss.cache).toBe('miss');
    expect(typesMiss.types[0]).toMatchObject({
      name: 'electric',
      pokemonCount: 1,
      moveCount: 1,
    });

    const naturesHit = await service.listNatures();
    expect(naturesHit.cache).toBe('hit');

    for (const key of Array.from(store.keys())) {
      if (!key.endsWith(':stale')) {
        store.delete(key);
      }
    }
    failUpstream = true;

    const naturesStale = await service.listNatures();
    expect(naturesStale.cache).toBe('stale-fallback');
    expect(naturesStale.total).toBe(2);

    const typesStale = await service.listTypes();
    expect(typesStale.cache).toBe('stale-fallback');
    expect(typesStale.types[0]?.name).toBe('electric');
  });

  it('rejects invalid identifiers and propagates 404 NotFoundException', async () => {
    const { service } = createHarness();
    createUpstreamMock();

    await expect(service.getMove('../bad')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.getMove('missing-move')).rejects.toThrow(
      NotFoundException,
    );
  });
});
