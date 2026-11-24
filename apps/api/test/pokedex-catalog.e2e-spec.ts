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
  lookup: jest.fn().mockResolvedValue([{ address: '2001:db8::1', family: 6 }]),
}));

function extractFetchUrl(input: string | URL | Request): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

const GRAPHQL_CATALOG = {
  data: {
    pokemon: [
      {
        id: 25,
        name: 'pikachu',
        is_default: true,
        pokemontypes: [{ slot: 1, type: { name: 'electric' } }],
        pokemonstats: [{ base_stat: 35 }, { base_stat: 90 }],
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

const GRAPHQL_META = {
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
    ],
  },
};

const REST_FIXTURES: Readonly<Record<string, unknown>> = {
  '/pokemon': {
    count: 1,
    results: [
      { name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon/25/' },
    ],
  },
  '/generation': {
    count: 1,
    results: [
      { name: 'generation-i', url: 'https://pokeapi.co/api/v2/generation/1/' },
    ],
  },
  '/pokemon-habitat': {
    count: 1,
    results: [
      { name: 'forest', url: 'https://pokeapi.co/api/v2/pokemon-habitat/2/' },
    ],
  },
  '/pokemon-color': {
    count: 1,
    results: [
      { name: 'yellow', url: 'https://pokeapi.co/api/v2/pokemon-color/10/' },
    ],
  },
  '/pokemon-shape': {
    count: 1,
    results: [
      { name: 'quadruped', url: 'https://pokeapi.co/api/v2/pokemon-shape/8/' },
    ],
  },
  '/egg-group': {
    count: 1,
    results: [
      { name: 'ground', url: 'https://pokeapi.co/api/v2/egg-group/5/' },
    ],
  },
  '/growth-rate': {
    count: 1,
    results: [
      { name: 'medium', url: 'https://pokeapi.co/api/v2/growth-rate/2/' },
    ],
  },
  '/region': {
    count: 1,
    results: [{ name: 'kanto', url: 'https://pokeapi.co/api/v2/region/1/' }],
  },
  '/type': {
    count: 1,
    results: [{ name: 'electric', url: 'https://pokeapi.co/api/v2/type/13/' }],
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

describe('Pokédex Catalog & Meta Filters HTTP Edge E2E', () => {
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

  it('serves /catalog/enriched with MISS -> HIT -> STALE-FALLBACK -> REST degraded fallback', async () => {
    let failGraphQl = false;

    jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const parsed = new URL(extractFetchUrl(input));
      if (parsed.hostname === 'graphql.pokeapi.co') {
        if (failGraphQl) {
          return Promise.resolve(new Response('GraphQL down', { status: 503 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify(GRAPHQL_CATALOG), { status: 200 }),
        );
      }
      const path = parsed.pathname.replace('/api/v2', '');
      return Promise.resolve(
        new Response(JSON.stringify(REST_FIXTURES[path]), { status: 200 }),
      );
    });

    const miss = await request(app.getHttpServer())
      .get('/api/v1/pokedex/catalog/enriched')
      .expect(200);
    expect(miss.headers['x-cache']).toBe('MISS');
    expect(miss.body).toMatchObject({
      cache: 'miss',
      source: 'graphql',
      degraded: false,
      count: 1,
    });

    const hit = await request(app.getHttpServer())
      .get('/api/v1/pokedex/catalog/enriched')
      .expect(200);
    expect(hit.headers['x-cache']).toBe('HIT');

    redisStore.delete('pokeapi:v2:catalog:enriched');
    failGraphQl = true;
    const stale = await request(app.getHttpServer())
      .get('/api/v1/pokedex/catalog/enriched')
      .expect(200);
    expect(stale.headers['x-cache']).toBe('STALE-FALLBACK');
    expect(stale.body).toMatchObject({ source: 'graphql', degraded: false });

    redisStore.delete('pokeapi:v2:catalog:enriched');
    redisStore.delete('pokeapi:v2:catalog:enriched:stale');
    const degraded = await request(app.getHttpServer())
      .get('/api/v1/pokedex/catalog/enriched')
      .expect(200);
    expect(degraded.headers['x-cache']).toBe('MISS');
    expect(degraded.body).toMatchObject({
      cache: 'miss',
      source: 'rest-fallback',
      degraded: true,
      count: 1,
    });
  });

  it('serves /meta/filters with MISS -> HIT -> REST fallback -> STALE-FALLBACK', async () => {
    let failGraphQl = false;
    let failRest = false;

    jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const parsed = new URL(extractFetchUrl(input));
      if (parsed.hostname === 'graphql.pokeapi.co') {
        if (failGraphQl) {
          return Promise.resolve(new Response('GraphQL down', { status: 503 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify(GRAPHQL_META), { status: 200 }),
        );
      }
      if (failRest) {
        return Promise.resolve(new Response('REST down', { status: 503 }));
      }
      const path = parsed.pathname.replace('/api/v2', '');
      return Promise.resolve(
        new Response(JSON.stringify(REST_FIXTURES[path]), { status: 200 }),
      );
    });

    const miss = await request(app.getHttpServer())
      .get('/api/v1/pokedex/meta/filters')
      .expect(200);
    expect(miss.headers['x-cache']).toBe('MISS');
    expect(miss.body).toMatchObject({
      cache: 'miss',
      filters: {
        types: [{ id: 13, name: 'electric' }],
      },
    });

    const hit = await request(app.getHttpServer())
      .get('/api/v1/pokedex/meta/filters')
      .expect(200);
    expect(hit.headers['x-cache']).toBe('HIT');

    redisStore.delete('pokeapi:v2:meta:filters');
    redisStore.delete('pokeapi:v2:meta:filters:stale');
    failGraphQl = true;
    const restFallback = await request(app.getHttpServer())
      .get('/api/v1/pokedex/meta/filters')
      .expect(200);
    expect(restFallback.headers['x-cache']).toBe('MISS');
    expect(restFallback.body).toMatchObject({
      cache: 'miss',
      filters: {
        generations: [{ id: 1, name: 'generation-i', regionName: 'kanto' }],
      },
    });

    redisStore.delete('pokeapi:v2:meta:filters');
    for (const key of Array.from(redisStore.keys())) {
      if (key.startsWith('pokeapi:v2:raw:meta-list:')) {
        redisStore.delete(key);
      }
    }
    failRest = true;
    const stale = await request(app.getHttpServer())
      .get('/api/v1/pokedex/meta/filters')
      .expect(200);
    expect(stale.headers['x-cache']).toBe('STALE-FALLBACK');
  });
});
