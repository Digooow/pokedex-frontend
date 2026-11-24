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
import {
  RAW_ADAMANT_NATURE,
  RAW_CHERI_BERRY,
  RAW_ELECTRIC_FULL_TYPE,
  RAW_FAIRY_EGG_GROUP,
  RAW_HARDY_NATURE,
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
} from '../src/testing/pokeapi-encyclopedia.fixtures';

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn().mockResolvedValue([{ address: '2001:db8::1', family: 6 }]),
}));

function extractFetchUrl(input: string | URL | Request): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

const E2E_FIXTURES: Readonly<Record<string, unknown>> = {
  '/move?limit=3000&offset=0': RAW_MOVE_INDEX,
  '/move/thunderbolt': RAW_THUNDERBOLT,
  '/ability/static': RAW_STATIC_ABILITY,
  '/item/light-ball': RAW_LIGHT_BALL_ITEM,
  '/berry/cheri': RAW_CHERI_BERRY,
  '/region/kanto': RAW_KANTO_REGION,
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

describe('Pokédex Encyclopedia HTTP Edge E2E', () => {
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
    await app.listen(0, '127.0.0.1');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves paginated /moves with single Redis index key and validates query bounds', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) => {
        const parsed = new URL(extractFetchUrl(input));
        const key = `${parsed.pathname.replace('/api/v2', '')}${parsed.search}`;
        const payload = E2E_FIXTURES[key];
        return payload
          ? Promise.resolve(
              new Response(JSON.stringify(payload), { status: 200 }),
            )
          : Promise.resolve(new Response('Not found', { status: 404 }));
      });

    const miss = await request(app.getHttpServer())
      .get('/api/v1/pokedex/moves?limit=1&offset=1')
      .expect(200);
    expect(miss.headers['x-cache']).toBe('MISS');
    expect(miss.body).toMatchObject({
      cache: 'miss',
      resource: 'move',
      total: 3,
      limit: 1,
      offset: 1,
      hasMore: true,
      items: [{ id: 85, name: 'thunderbolt' }],
    });

    const hit = await request(app.getHttpServer())
      .get('/api/v1/pokedex/moves?limit=2&offset=0&q=thunder')
      .expect(200);
    expect(hit.headers['x-cache']).toBe('HIT');
    expect(hit.body).toMatchObject({
      cache: 'hit',
      total: 2,
      hasMore: false,
      items: [
        { id: 85, name: 'thunderbolt' },
        { id: 86, name: 'thunder-wave' },
      ],
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await request(app.getHttpServer())
      .get('/api/v1/pokedex/moves?limit=0')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/pokedex/moves?limit=101')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/pokedex/moves?offset=-1')
      .expect(400);
  });

  it('serves reverse-lookup detail endpoints with alias caching and border validation', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const parsed = new URL(extractFetchUrl(input));
      const key = `${parsed.pathname.replace('/api/v2', '')}${parsed.search}`;
      const payload = E2E_FIXTURES[key];
      return payload
        ? Promise.resolve(
            new Response(JSON.stringify(payload), { status: 200 }),
          )
        : Promise.resolve(new Response('Not found', { status: 404 }));
    });

    const moveMiss = await request(app.getHttpServer())
      .get('/api/v1/pokedex/moves/thunderbolt')
      .expect(200);
    expect(moveMiss.headers['x-cache']).toBe('MISS');
    expect(moveMiss.body).toMatchObject({
      move: { id: 85, name: 'thunderbolt', type: 'electric' },
    });

    const moveAliasHit = await request(app.getHttpServer())
      .get('/api/v1/pokedex/moves/85')
      .expect(200);
    expect(moveAliasHit.headers['x-cache']).toBe('HIT');

    await request(app.getHttpServer())
      .get('/api/v1/pokedex/moves/..%2Fevil')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/pokedex/moves/missing-move')
      .expect(404);

    const detailChecks: readonly [string, Record<string, unknown>][] = [
      ['/api/v1/pokedex/abilities/static', { ability: { name: 'static' } }],
      ['/api/v1/pokedex/items/light-ball', { item: { name: 'light-ball' } }],
      ['/api/v1/pokedex/berries/cheri', { berry: { itemId: 126 } }],
      ['/api/v1/pokedex/regions/kanto', { region: { name: 'kanto' } }],
      ['/api/v1/pokedex/pokedexes/kanto', { pokedex: { totalEntries: 1 } }],
      [
        '/api/v1/pokedex/locations/viridian-forest',
        { location: { localizedName: 'Viridian Forest' } },
      ],
      ['/api/v1/pokedex/egg-groups/fairy', { eggGroup: { speciesCount: 1 } }],
      [
        '/api/v1/pokedex/growth-rates/medium',
        { growthRate: { speciesCount: 1 } },
      ],
    ];

    const detailResults = await Promise.all(
      detailChecks.map(async ([route, expectedBody]) => ({
        expectedBody,
        response: await request(app.getHttpServer()).get(route).expect(200),
      })),
    );

    for (const { response, expectedBody } of detailResults) {
      expect(response.headers['x-cache']).toBe('MISS');
      expect(response.body).toMatchObject(expectedBody);
    }
  });

  it('serves /natures and /types with MISS -> HIT -> STALE-FALLBACK semantics', async () => {
    let failUpstream = false;

    jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (failUpstream) {
        return Promise.resolve(new Response('Upstream down', { status: 503 }));
      }
      const parsed = new URL(extractFetchUrl(input));
      const key = `${parsed.pathname.replace('/api/v2', '')}${parsed.search}`;
      const payload = E2E_FIXTURES[key];
      return payload
        ? Promise.resolve(
            new Response(JSON.stringify(payload), { status: 200 }),
          )
        : Promise.resolve(new Response('Not found', { status: 404 }));
    });

    const naturesMiss = await request(app.getHttpServer())
      .get('/api/v1/pokedex/natures')
      .expect(200);
    expect(naturesMiss.headers['x-cache']).toBe('MISS');
    expect(naturesMiss.body).toMatchObject({ total: 2 });

    const natureDetail = await request(app.getHttpServer())
      .get('/api/v1/pokedex/natures/adamant')
      .expect(200);
    expect(natureDetail.headers['x-cache']).toBe('MISS');
    expect(natureDetail.body).toMatchObject({
      nature: { name: 'adamant', isNeutral: false },
    });

    const typesMiss = await request(app.getHttpServer())
      .get('/api/v1/pokedex/types')
      .expect(200);
    expect(typesMiss.headers['x-cache']).toBe('MISS');
    expect(typesMiss.body).toMatchObject({ total: 1 });

    const typeDetail = await request(app.getHttpServer())
      .get('/api/v1/pokedex/types/electric')
      .expect(200);
    expect(typeDetail.headers['x-cache']).toBe('MISS');
    expect(typeDetail.body).toMatchObject({
      type: { name: 'electric', pokemonCount: 1, moveCount: 1 },
    });

    const typesHit = await request(app.getHttpServer())
      .get('/api/v1/pokedex/types')
      .expect(200);
    expect(typesHit.headers['x-cache']).toBe('HIT');

    for (const key of Array.from(redisStore.keys())) {
      if (!key.endsWith(':stale')) {
        redisStore.delete(key);
      }
    }
    failUpstream = true;

    const naturesStale = await request(app.getHttpServer())
      .get('/api/v1/pokedex/natures')
      .expect(200);
    expect(naturesStale.headers['x-cache']).toBe('STALE-FALLBACK');

    const typesStale = await request(app.getHttpServer())
      .get('/api/v1/pokedex/types')
      .expect(200);
    expect(typesStale.headers['x-cache']).toBe('STALE-FALLBACK');
  });
});
