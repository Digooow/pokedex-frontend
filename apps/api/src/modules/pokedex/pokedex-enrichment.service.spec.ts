import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import type { RedisService } from '../../infra/redis.service';
import {
  POKEAPI_SPRITE_BASE,
  RAW_CHARIZARD,
  RAW_CHARIZARD_MEGA_X,
  RAW_CHARIZARD_SPECIES,
  RAW_EVOLUTION_CHAIN,
  RAW_TYPE_MAP,
} from '../../testing/pokeapi-enrichment.fixtures';
import { PokeApiHttpCacheClient } from './pokeapi-http-cache.client';
import { PokeApiResourceFetcher } from './pokeapi-resource.fetcher';
import { PokedexEnrichmentService } from './pokedex-enrichment.service';

jest.mock('node:dns/promises', () => ({
  lookup: jest
    .fn()
    .mockResolvedValue([{ address: '104.26.10.233', family: 4 }]),
}));

function createServiceHarness() {
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
  const fetcher = new PokeApiResourceFetcher(client);
  return { store, service: new PokedexEnrichmentService(client, fetcher) };
}

function resolveFetchUrl(input: string | URL | Request): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

function createUpstreamMock() {
  return jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = resolveFetchUrl(input);
    if (url.endsWith('/pokemon/charizard')) {
      return Promise.resolve(
        new Response(JSON.stringify(RAW_CHARIZARD), { status: 200 }),
      );
    }
    if (url.endsWith('/pokemon/charizard-mega-x')) {
      return Promise.resolve(
        new Response(JSON.stringify(RAW_CHARIZARD_MEGA_X), { status: 200 }),
      );
    }
    if (url.endsWith('/pokemon-species/charizard')) {
      return Promise.resolve(
        new Response(JSON.stringify(RAW_CHARIZARD_SPECIES), { status: 200 }),
      );
    }
    if (url.endsWith('/evolution-chain/2')) {
      return Promise.resolve(
        new Response(JSON.stringify(RAW_EVOLUTION_CHAIN), { status: 200 }),
      );
    }
    if (url.includes('/type/')) {
      const typeName = url.split('/type/')[1] ?? '';
      const payload = RAW_TYPE_MAP[typeName];
      if (payload) {
        return Promise.resolve(
          new Response(JSON.stringify(payload), { status: 200 }),
        );
      }
    }
    if (url.endsWith('/pokemon/6/encounters')) {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              location_area: {
                name: 'cerulean-cave-1f',
                url: 'https://pokeapi.co/api/v2/location-area/147/',
              },
              version_details: [
                {
                  max_chance: 5,
                  version: {
                    name: 'red',
                    url: 'https://pokeapi.co/api/v2/version/1/',
                  },
                  encounter_details: [
                    {
                      min_level: 40,
                      max_level: 45,
                      chance: 5,
                      method: {
                        name: 'walk',
                        url: 'https://pokeapi.co/api/v2/encounter-method/1/',
                      },
                      condition_values: [],
                    },
                  ],
                },
              ],
            },
          ]),
          { status: 200 },
        ),
      );
    }
    if (url.endsWith('/pokemon-form/charizard')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: 6,
            name: 'charizard',
            form_name: '',
            form_order: 1,
            is_default: true,
            is_battle_only: false,
            is_mega: false,
            version_group: {
              name: 'red-blue',
              url: 'https://pokeapi.co/api/v2/version-group/1/',
            },
            types: RAW_CHARIZARD.types,
            sprites: { front_default: `${POKEAPI_SPRITE_BASE}/6.png` },
          }),
          { status: 200 },
        ),
      );
    }
    return Promise.resolve(new Response('Not found', { status: 404 }));
  });
}

describe('PokedexEnrichmentService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects malformed identifiers and aggregates bundle with 0x..4x type matrix and cached hits', async () => {
    const { store, service } = createServiceHarness();
    const fetchSpy = createUpstreamMock();

    await expect(service.getPokemonBundle('../bad')).rejects.toThrow(
      BadRequestException,
    );

    const miss = await service.getPokemonBundle('Charizard');
    expect(miss.cache).toBe('miss');
    expect(miss.bundle.pokemon.baseStatTotal).toBe(534);
    expect(miss.bundle.species.flavorTexts[0]?.text).toBe(
      'Spits fire that is hot enough to melt boulders.',
    );
    expect(miss.bundle.evolutionChain?.root.speciesName).toBe('charmander');
    expect(miss.bundle.typeEffectiveness.quadWeak).toEqual(['rock']);
    expect(miss.bundle.typeEffectiveness.immune).toEqual(['ground']);
    expect(miss.bundle.typeEffectiveness.quadResistant).toEqual([
      'grass',
      'bug',
    ]);
    expect(miss.bundle.pokemon.historicalSprites).toHaveLength(1);

    const hitById = await service.getPokemonBundle('6');
    expect(hitById.cache).toBe('hit');
    expect(fetchSpy).toHaveBeenCalledTimes(5);

    store.delete('pokeapi:v2:bundle:charizard');
    store.delete('pokeapi:v2:raw:pokemon:charizard');
    fetchSpy.mockResolvedValueOnce(new Response('Down', { status: 503 }));
    const stale = await service.getPokemonBundle('charizard');
    expect(stale.cache).toBe('stale-fallback');
  });

  it('resolves alternate variety species fallback, encounters, and partial-404 forms gracefully', async () => {
    const { service } = createServiceHarness();
    createUpstreamMock();

    const megaBundle = await service.getPokemonBundle('charizard-mega-x');
    expect(megaBundle.bundle.species.name).toBe('charizard');
    expect(megaBundle.bundle.typeEffectiveness.quadResistant).toContain('fire');

    const encounters = await service.getPokemonEncounters('charizard');
    expect(encounters.cache).toBe('miss');
    expect(encounters.encounters[0]?.locationAreaId).toBe(147);

    const forms = await service.getPokemonForms('charizard');
    expect(forms.cache).toBe('miss');
    expect(forms.forms).toHaveLength(1);
    expect(forms.varieties).toHaveLength(2);
  });

  it('fetches and sorts more than one batch of forms in deterministic formOrder', async () => {
    const { service } = createServiceHarness();
    const formSlugs = Array.from(
      { length: 8 },
      (_, idx) => `alcremie-${idx + 1}`,
    );
    const multiFormPokemon = {
      ...RAW_CHARIZARD,
      id: 869,
      name: 'alcremie',
      species: {
        name: 'alcremie',
        url: 'https://pokeapi.co/api/v2/pokemon-species/869/',
      },
      forms: formSlugs.map((name, idx) => ({
        name,
        url: `https://pokeapi.co/api/v2/pokemon-form/${869 + idx}/`,
      })),
    };
    const multiFormSpecies = {
      ...RAW_CHARIZARD_SPECIES,
      id: 869,
      name: 'alcremie',
      forms_switchable: true,
      varieties: [
        {
          is_default: true,
          pokemon: {
            name: 'alcremie',
            url: 'https://pokeapi.co/api/v2/pokemon/869/',
          },
        },
      ],
    };

    jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = resolveFetchUrl(input);
      if (url.endsWith('/pokemon/alcremie')) {
        return Promise.resolve(
          new Response(JSON.stringify(multiFormPokemon), { status: 200 }),
        );
      }
      if (url.endsWith('/pokemon-species/alcremie')) {
        return Promise.resolve(
          new Response(JSON.stringify(multiFormSpecies), { status: 200 }),
        );
      }
      const match = /\/pokemon-form\/(alcremie-(\d+))$/.exec(url);
      if (match) {
        const index = Number(match[2]);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 900 + index,
              name: match[1],
              form_name: `form-${index}`,
              form_order: 20 - index,
              is_default: index === 1,
              is_battle_only: false,
              is_mega: false,
              version_group: {
                name: 'sword-shield',
                url: 'https://pokeapi.co/api/v2/version-group/20/',
              },
              types: RAW_CHARIZARD.types,
              sprites: { front_default: `${POKEAPI_SPRITE_BASE}/869.png` },
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response('Not found', { status: 404 }));
    });

    const result = await service.getPokemonForms('alcremie');
    expect(result.forms).toHaveLength(8);
    expect(result.forms.map((f) => f.name)).toEqual([...formSlugs].reverse());
  });
});
