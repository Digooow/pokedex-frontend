import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApiApp } from '../src/app.setup';
import {
  InfraProbesService,
  type ReadinessChecks,
} from '../src/infra/infra-probes.service';
import { KafkaService } from '../src/infra/kafka.service';
import { PrismaService } from '../src/infra/prisma.service';
import { RedisService } from '../src/infra/redis.service';

jest.mock('node:dns/promises', () => ({
  lookup: jest
    .fn()
    .mockResolvedValue([{ address: '104.26.10.233', family: 4 }]),
}));

const SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

const UPSTREAM_FIXTURES: Readonly<Record<string, unknown>> = {
  '/pokemon/charizard': {
    id: 6,
    name: 'charizard',
    order: 7,
    is_default: true,
    height: 17,
    weight: 905,
    base_experience: 267,
    species: {
      name: 'charizard',
      url: 'https://pokeapi.co/api/v2/pokemon-species/6/',
    },
    types: [
      {
        slot: 1,
        type: { name: 'fire', url: 'https://pokeapi.co/api/v2/type/10/' },
      },
      {
        slot: 2,
        type: { name: 'flying', url: 'https://pokeapi.co/api/v2/type/3/' },
      },
    ],
    abilities: [
      {
        is_hidden: false,
        slot: 1,
        ability: {
          name: 'blaze',
          url: 'https://pokeapi.co/api/v2/ability/66/',
        },
      },
    ],
    stats: [
      {
        base_stat: 78,
        effort: 0,
        stat: { name: 'hp', url: 'https://pokeapi.co/api/v2/stat/1/' },
      },
    ],
    sprites: { front_default: `${SPRITE_BASE}/6.png` },
    cries: {
      latest:
        'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/6.ogg',
    },
    moves: [],
    held_items: [],
    forms: [
      { name: 'charizard', url: 'https://pokeapi.co/api/v2/pokemon-form/6/' },
    ],
    past_types: [],
    past_abilities: [],
  },
  '/pokemon-species/charizard': {
    id: 6,
    name: 'charizard',
    capture_rate: 45,
    base_happiness: 50,
    gender_rate: 1,
    has_gender_differences: false,
    hatch_counter: 20,
    growth_rate: {
      name: 'medium-slow',
      url: 'https://pokeapi.co/api/v2/growth-rate/4/',
    },
    color: { name: 'red', url: 'https://pokeapi.co/api/v2/pokemon-color/8/' },
    shape: {
      name: 'upright',
      url: 'https://pokeapi.co/api/v2/pokemon-shape/6/',
    },
    habitat: {
      name: 'mountain',
      url: 'https://pokeapi.co/api/v2/pokemon-habitat/4/',
    },
    generation: {
      name: 'generation-i',
      url: 'https://pokeapi.co/api/v2/generation/1/',
    },
    is_baby: false,
    is_legendary: false,
    is_mythical: false,
    forms_switchable: false,
    egg_groups: [
      { name: 'monster', url: 'https://pokeapi.co/api/v2/egg-group/1/' },
    ],
    pokedex_numbers: [
      {
        entry_number: 6,
        pokedex: {
          name: 'national',
          url: 'https://pokeapi.co/api/v2/pokedex/1/',
        },
      },
    ],
    evolves_from_species: null,
    evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/2/' },
    genera: [
      {
        genus: 'Flame Pokémon',
        language: { name: 'en', url: 'https://pokeapi.co/api/v2/language/9/' },
      },
    ],
    flavor_text_entries: [],
    varieties: [
      {
        is_default: true,
        pokemon: {
          name: 'charizard',
          url: 'https://pokeapi.co/api/v2/pokemon/6/',
        },
      },
    ],
  },
  '/evolution-chain/2': {
    id: 2,
    baby_trigger_item: null,
    chain: {
      is_baby: false,
      species: {
        name: 'charmander',
        url: 'https://pokeapi.co/api/v2/pokemon-species/4/',
      },
      evolution_details: [],
      evolves_to: [],
    },
  },
  '/type/fire': {
    name: 'fire',
    damage_relations: {
      double_damage_from: [
        { name: 'rock', url: 'https://pokeapi.co/api/v2/type/6/' },
      ],
      half_damage_from: [],
      no_damage_from: [],
    },
  },
  '/type/flying': {
    name: 'flying',
    damage_relations: {
      double_damage_from: [
        { name: 'rock', url: 'https://pokeapi.co/api/v2/type/6/' },
      ],
      half_damage_from: [],
      no_damage_from: [
        { name: 'ground', url: 'https://pokeapi.co/api/v2/type/5/' },
      ],
    },
  },
  '/pokemon/6/encounters': [],
  '/pokemon-form/charizard': {
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
    types: [
      {
        slot: 1,
        type: { name: 'fire', url: 'https://pokeapi.co/api/v2/type/10/' },
      },
    ],
    sprites: { front_default: `${SPRITE_BASE}/6.png` },
  },
};

function createRedisMock(kv: Map<string, string>) {
  return {
    ping: jest.fn().mockResolvedValue('PONG'),
    getString: jest.fn((key: string) => Promise.resolve(kv.get(key) ?? null)),
    setStringEx: jest.fn().mockResolvedValue(undefined),
    setStringNxEx: jest.fn().mockResolvedValue(true),
    delKeys: jest.fn().mockResolvedValue(0),
    consumeString: jest.fn().mockResolvedValue(null),
    consumeJson: jest.fn().mockResolvedValue(null),
    addToSetWithTtl: jest.fn().mockResolvedValue(undefined),
    getSetMembers: jest.fn().mockResolvedValue([]),
    getJson: jest.fn((key: string) => {
      const raw = kv.get(key);
      return Promise.resolve(raw ? (JSON.parse(raw) as unknown) : null);
    }),
    setJsonEx: jest.fn((key: string, _ttl: number, value: unknown) => {
      kv.set(key, JSON.stringify(value));
      return Promise.resolve();
    }),
    acquireIdempotencyLock: jest.fn().mockResolvedValue(true),
    incrementThrottle: jest.fn().mockResolvedValue({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    }),
    onModuleDestroy: jest.fn(),
  };
}

describe('Pokédex Enrichment HTTP Edge E2E (/bundle, /encounters, /forms)', () => {
  let app: INestApplication<App>;
  const redisStore = new Map<string, string>();

  beforeAll(async () => {
    const healthyChecks: ReadinessChecks = {
      postgres: { status: 'up', latencyMs: 2 },
      redis: { status: 'up', latencyMs: 1 },
      kafka: { status: 'up', latencyMs: 4 },
      s3: { status: 'up', latencyMs: 0, detail: 'disabled' },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(RedisService)
      .useValue(createRedisMock(redisStore))
      .overrideProvider(KafkaService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        describeCluster: jest.fn().mockResolvedValue(1),
      })
      .overrideProvider(InfraProbesService)
      .useValue({
        checkAll: jest.fn().mockResolvedValue(healthyChecks),
        onModuleDestroy: jest.fn(),
      })
      .compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApiApp(app);
    await app.init();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects invalid identifiers with 400 and missing species with 404', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('Not found', { status: 404 }));

    await request(app.getHttpServer())
      .get('/api/v1/pokedex/pokemon/bad!slug/bundle')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/pokedex/pokemon/bad!slug/encounters')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/pokedex/pokemon/bad!slug/forms')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/pokedex/pokemon/missingno-test/bundle')
      .expect(404);
  });

  it('serves /bundle, /encounters, and /forms with X-Cache MISS -> HIT -> STALE-FALLBACK', async () => {
    let failUpstream = false;
    jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (failUpstream) {
        return Promise.resolve(new Response('Upstream down', { status: 503 }));
      }
      let url: string;
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else {
        url = input.url;
      }
      const path = new URL(url).pathname.replace('/api/v2', '');
      const fixture = UPSTREAM_FIXTURES[path];
      if (fixture !== undefined) {
        return Promise.resolve(
          new Response(JSON.stringify(fixture), { status: 200 }),
        );
      }
      return Promise.resolve(new Response('Not found', { status: 404 }));
    });

    const bundleMiss = await request(app.getHttpServer())
      .get('/api/v1/pokedex/pokemon/charizard/bundle')
      .expect(200);
    expect(bundleMiss.headers['x-cache']).toBe('MISS');
    expect(bundleMiss.body).toMatchObject({
      cache: 'miss',
      bundle: {
        pokemon: { id: 6, name: 'charizard' },
        typeEffectiveness: { quadWeak: ['rock'], immune: ['ground'] },
      },
    });

    const bundleHit = await request(app.getHttpServer())
      .get('/api/v1/pokedex/pokemon/6/bundle')
      .expect(200);
    expect(bundleHit.headers['x-cache']).toBe('HIT');

    redisStore.delete('pokeapi:v2:bundle:charizard');
    redisStore.delete('pokeapi:v2:raw:pokemon:charizard');
    failUpstream = true;
    const bundleStale = await request(app.getHttpServer())
      .get('/api/v1/pokedex/pokemon/charizard/bundle')
      .expect(200);
    expect(bundleStale.headers['x-cache']).toBe('STALE-FALLBACK');

    failUpstream = false;
    const encMiss = await request(app.getHttpServer())
      .get('/api/v1/pokedex/pokemon/charizard/encounters')
      .expect(200);
    expect(encMiss.headers['x-cache']).toBe('MISS');

    const encHit = await request(app.getHttpServer())
      .get('/api/v1/pokedex/pokemon/charizard/encounters')
      .expect(200);
    expect(encHit.headers['x-cache']).toBe('HIT');

    const formsMiss = await request(app.getHttpServer())
      .get('/api/v1/pokedex/pokemon/charizard/forms')
      .expect(200);
    expect(formsMiss.headers['x-cache']).toBe('MISS');
    expect(formsMiss.body).toMatchObject({
      cache: 'miss',
      pokemonId: 6,
      speciesName: 'charizard',
    });

    const formsHit = await request(app.getHttpServer())
      .get('/api/v1/pokedex/pokemon/charizard/forms')
      .expect(200);
    expect(formsHit.headers['x-cache']).toBe('HIT');
  });
});
