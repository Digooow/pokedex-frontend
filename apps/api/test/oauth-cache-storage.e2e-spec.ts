import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OutboxStatus } from '@prisma/client';
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
import { GoogleOAuthHttpClient } from '../src/modules/auth/google-oauth-http.client';
import { GoogleOidcVerifier } from '../src/modules/auth/google-oidc.verifier';

jest.mock('node:dns/promises', () => ({
  lookup: jest
    .fn()
    .mockResolvedValue([{ address: '104.26.10.233', family: 4 }]),
}));

interface StoredTrainer {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
  readonly mfaEnabled: boolean;
  readonly role: 'TRAINER' | 'MODERATOR' | 'ADMIN';
  readonly passwordHash: string | null;
  readonly totpSecretEncrypted: string | null;
  readonly badgesCount: number;
  readonly eloRating: number;
  readonly lastMapId: string;
  readonly lastX: number;
  readonly lastY: number;
  readonly createdAt: Date;
}

function createInMemoryRedisMock(kv: Map<string, string>) {
  return {
    ping: jest.fn().mockResolvedValue('PONG'),
    getString: jest.fn((key: string) => Promise.resolve(kv.get(key) ?? null)),
    setStringEx: jest.fn((key: string, _ttl: number, value: string) => {
      kv.set(key, value);
      return Promise.resolve();
    }),
    setStringNxEx: jest.fn((key: string, _ttl: number, value: string) => {
      if (kv.has(key)) return Promise.resolve(false);
      kv.set(key, value);
      return Promise.resolve(true);
    }),
    delKeys: jest.fn((...keys: string[]) => {
      let count = 0;
      for (const k of keys) {
        if (kv.delete(k)) count += 1;
      }
      return Promise.resolve(count);
    }),
    consumeString: jest.fn((key: string) => {
      const val = kv.get(key) ?? null;
      kv.delete(key);
      return Promise.resolve(val);
    }),
    consumeJson: jest.fn((key: string) => {
      const raw = kv.get(key);
      kv.delete(key);
      return Promise.resolve(raw ? (JSON.parse(raw) as unknown) : null);
    }),
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

function createInMemoryPrismaMock() {
  const trainers = new Map<string, StoredTrainer>();
  const oauthLinks = new Map<string, string>();
  const outboxEvents: Array<Record<string, unknown>> = [];

  const txDelegate = {
    trainer: {
      create: jest.fn(
        (args: {
          data: {
            id: string;
            username: string;
            email: string;
            passwordHash: string | null;
            emailVerifiedAt: Date | null;
          };
        }) => {
          const row: StoredTrainer = {
            id: args.data.id,
            username: args.data.username,
            email: args.data.email,
            passwordHash: args.data.passwordHash,
            emailVerifiedAt: args.data.emailVerifiedAt,
            mfaEnabled: false,
            role: 'TRAINER',
            totpSecretEncrypted: null,
            badgesCount: 0,
            eloRating: 1000,
            lastMapId: 'pokeverse-town',
            lastX: 400,
            lastY: 320,
            createdAt: new Date(),
          };
          trainers.set(row.id, row);
          return Promise.resolve(row);
        },
      ),
    },
    trainerOAuthAccount: {
      create: jest.fn(
        (args: {
          data: {
            trainerId: string;
            provider: string;
            providerAccountId: string;
          };
        }) => {
          oauthLinks.set(
            `${args.data.provider}:${args.data.providerAccountId}`,
            args.data.trainerId,
          );
          return Promise.resolve(args.data);
        },
      ),
    },
    outboxEvent: {
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        outboxEvents.push(args.data);
        return Promise.resolve(args.data);
      }),
    },
  };

  const prismaMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn((fn: (tx: typeof txDelegate) => Promise<unknown>) =>
      fn(txDelegate),
    ),
    trainer: {
      findUnique: jest.fn(
        (args: { where: { id?: string; email?: string } }) => {
          if (args.where.id) {
            return Promise.resolve(trainers.get(args.where.id) ?? null);
          }
          if (args.where.email) {
            const match = Array.from(trainers.values()).find(
              (item) => item.email === args.where.email,
            );
            return Promise.resolve(match ?? null);
          }
          return Promise.resolve(null);
        },
      ),
    },
    trainerOAuthAccount: {
      findUnique: jest.fn(
        (args: {
          where: {
            provider_providerAccountId: {
              provider: string;
              providerAccountId: string;
            };
          };
        }) => {
          const key = `${args.where.provider_providerAccountId.provider}:${args.where.provider_providerAccountId.providerAccountId}`;
          const trainerId = oauthLinks.get(key);
          const trainer = trainerId ? trainers.get(trainerId) : undefined;
          return Promise.resolve(trainer ? { trainer, trainerId } : null);
        },
      ),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({ id: 'rt-1' }),
    },
  };

  return { prismaMock, outboxEvents };
}

const SAMPLE_PIKACHU_UPSTREAM = {
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

function extractCookiePair(
  headers: object,
  cookieName: string,
): string | undefined {
  const raw: unknown = Reflect.get(headers, 'set-cookie');
  let entries: string[] = [];
  if (Array.isArray(raw)) {
    entries = raw.filter((item): item is string => typeof item === 'string');
  } else if (typeof raw === 'string') {
    entries = [raw];
  }
  const prefix = `${cookieName}=`;
  return entries.find((entry) => entry.startsWith(prefix))?.split(';')[0];
}

describe('PokéVerse API E2E (Simulated Google OAuth PKCE & Redis Cache Policy)', () => {
  let app: INestApplication<App>;
  const redisStore = new Map<string, string>();
  const { prismaMock, outboxEvents } = createInMemoryPrismaMock();

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
      .useValue(prismaMock)
      .overrideProvider(RedisService)
      .useValue(createInMemoryRedisMock(redisStore))
      .overrideProvider(KafkaService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        describeCluster: jest.fn().mockResolvedValue(1),
        publish: jest.fn(),
        publishDlq: jest.fn(),
      })
      .overrideProvider(InfraProbesService)
      .useValue({
        checkAll: jest.fn().mockResolvedValue(healthyChecks),
        onModuleDestroy: jest.fn(),
      })
      .overrideProvider(GoogleOAuthHttpClient)
      .useValue({
        exchangeAuthorizationCode: jest.fn().mockResolvedValue({
          id_token: 'simulated.oidc.jwt',
          token_type: 'Bearer',
        }),
        fetchJwks: jest.fn().mockResolvedValue([]),
      })
      .overrideProvider(GoogleOidcVerifier)
      .useValue({
        verifyTokenWithJwksCache: jest.fn().mockResolvedValue({
          iss: 'https://accounts.google.com',
          aud: 'e2e-google-client',
          sub: 'google-sub-e2e-001',
          email: 'misty@pokeverse.dev',
          email_verified: true,
          nonce: 'simulated-nonce',
          exp: Math.floor(Date.now() / 1000) + 600,
          name: 'Misty_Cerulean',
        }),
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

  it('authenticates trainer end-to-end via simulated Google OAuth PKCE, writes OutboxEvent, prevents state replay, and serves /auth/me', async () => {
    const startRes = await request(app.getHttpServer())
      .get('/api/v1/auth/google/start')
      .expect(302);

    const authorizeUrl = new URL(startRes.headers['location'] as string);
    expect(authorizeUrl.hostname).toBe('accounts.google.com');
    const state = authorizeUrl.searchParams.get('state');
    expect(state).toBeTruthy();

    const bindCookieHeader = extractCookiePair(
      startRes.headers,
      'pokeverse_oauth_bind',
    );
    expect(bindCookieHeader).toBeTruthy();

    const callbackRes = await request(app.getHttpServer())
      .get(`/api/v1/auth/google/callback?code=oauth_code_1&state=${state}`)
      .set('Cookie', bindCookieHeader ?? '')
      .expect(302);

    expect(callbackRes.headers['location']).toBe('http://127.0.0.1:4200/');
    const sessionCookie = extractCookiePair(
      callbackRes.headers,
      'pokeverse_session',
    );
    expect(sessionCookie).toBeTruthy();
    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0]?.['status']).toBe(OutboxStatus.PENDING);

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie ?? '')
      .expect(200);
    expect(meRes.body).toMatchObject({
      email: 'misty@pokeverse.dev',
      username: 'Misty_Cerulean',
    });

    const replayRes = await request(app.getHttpServer())
      .get(`/api/v1/auth/google/callback?code=oauth_code_1&state=${state}`)
      .set('Cookie', bindCookieHeader ?? '')
      .expect(302);
    expect(replayRes.headers['location']).toContain(
      'authError=oauth_state_invalid',
    );
  });

  it('transitions PokéAPI cache across X-Cache MISS -> HIT -> STALE-FALLBACK when primary Redis key expires', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SAMPLE_PIKACHU_UPSTREAM), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('Upstream down', { status: 503 }));

    const missRes = await request(app.getHttpServer())
      .get('/api/v1/pokedex/pokemon/pikachu')
      .expect(200);
    expect(missRes.headers['x-cache']).toBe('MISS');
    expect(missRes.body).toMatchObject({
      cache: 'miss',
      pokemon: { id: 25, name: 'pikachu' },
    });

    const hitRes = await request(app.getHttpServer())
      .get('/api/v1/pokedex/pokemon/pikachu')
      .expect(200);
    expect(hitRes.headers['x-cache']).toBe('HIT');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    redisStore.delete('pokeapi:v2:pokemon:pikachu');
    const staleRes = await request(app.getHttpServer())
      .get('/api/v1/pokedex/pokemon/pikachu')
      .expect(200);
    expect(staleRes.headers['x-cache']).toBe('STALE-FALLBACK');
    expect(staleRes.body).toMatchObject({
      cache: 'stale-fallback',
      pokemon: { id: 25, name: 'pikachu' },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
