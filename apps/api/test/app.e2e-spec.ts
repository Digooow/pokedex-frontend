import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
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
import { SessionService } from '../src/modules/auth/session.service';

describe('PokéVerse API (e2e)', () => {
  let app: INestApplication<App>;
  const sessionStore = new Map<string, string>();

  beforeAll(async () => {
    const healthyChecks: ReadinessChecks = {
      postgres: { status: 'up', latencyMs: 2 },
      redis: { status: 'up', latencyMs: 1 },
      kafka: { status: 'up', latencyMs: 8 },
      s3: { status: 'up', latencyMs: 4 },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .overrideProvider(RedisService)
      .useValue({
        ping: jest.fn().mockResolvedValue('PONG'),
        getString: jest.fn((key: string) =>
          Promise.resolve(sessionStore.get(key) ?? null),
        ),
        setStringEx: jest.fn((key: string, _ttl: number, value: string) => {
          sessionStore.set(key, value);
          return Promise.resolve();
        }),
        setStringNxEx: jest.fn((key: string, _ttl: number, value: string) => {
          if (sessionStore.has(key)) {
            return Promise.resolve(false);
          }
          sessionStore.set(key, value);
          return Promise.resolve(true);
        }),
        delKeys: jest.fn((...keys: string[]) => {
          for (const key of keys) {
            sessionStore.delete(key);
          }
          return Promise.resolve();
        }),
        addToSetWithTtl: jest.fn().mockResolvedValue(undefined),
        getSetMembers: jest.fn().mockResolvedValue([]),
        getJson: jest.fn((key: string) => {
          const raw = sessionStore.get(key);
          return Promise.resolve(raw ? (JSON.parse(raw) as unknown) : null);
        }),
        setJsonEx: jest.fn((key: string, _ttl: number, value: unknown) => {
          sessionStore.set(key, JSON.stringify(value));
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
      })
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
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    configureApiApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live returns 200 ok with correlation and security headers', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'pokeverse-api' });
    expect(res.headers['x-correlation-id']).toBeTruthy();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['permissions-policy']).toContain('camera=()');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('GET /health/ready validates all 4 dependencies', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      dependencies: {
        postgres: { status: 'up' },
        redis: { status: 'up' },
        kafka: { status: 'up' },
        s3: { status: 'up' },
      },
    });
  });

  it('GET /api/v1/auth/session returns clean visitor state without 401 console error', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .expect(200);
    expect(res.body).toEqual({ authenticated: false, canRefresh: false });
  });

  it('blocks unauthenticated visitors with 401 on protected endpoints', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me/export')
      .expect(401);
    await request(app.getHttpServer()).get('/api/v1/auth/sessions').expect(401);
    await request(app.getHttpServer()).get('/api/v1/pokedex/slots').expect(401);
    await request(app.getHttpServer())
      .put('/api/v1/pokedex/slots/0')
      .send({ slotIndex: 0, pokemonId: 25, pokemonName: 'pikachu' })
      .expect(401);
  });

  it('blocks cross-site CSRF origins and form-encoded Content-Types with 403', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', 'https://evil.example')
      .expect(403);

    await request(app.getHttpServer())
      .put('/api/v1/pokedex/slots/0')
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ slotIndex: 0, pokemonId: 25, pokemonName: 'pikachu' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://localhost:4200')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('evil=1')
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://localhost:4200')
      .set('Content-Type', 'text/plain')
      .send('evil=1')
      .expect(403);
  });

  it('enforces MFA_PENDING session state machine blocking protected routes until 2FA completion', async () => {
    const sessionService = app.get(SessionService);
    const { rawSid } = await sessionService.createSession({
      trainerId: '550e8400-e29b-41d4-a716-446655440000',
      username: 'Red_Kanto',
      familyId: '550e8400-e29b-41d4-a716-446655440099',
      state: 'MFA_PENDING',
      mfaMethods: ['totp', 'backup_code'],
    });

    await request(app.getHttpServer())
      .get('/api/v1/pokedex/slots')
      .set('Cookie', `pokeverse_session=${rawSid}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/auth/security/overview')
      .set('Cookie', `pokeverse_session=${rawSid}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://localhost:4200')
      .set('Cookie', `pokeverse_session=${rawSid}`)
      .expect(204);
  });

  it('GET /api/v1/auth/providers returns public IAM capability flags', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/providers')
      .expect(200);
    expect(res.body).toEqual({
      googleEnabled: expect.any(Boolean) as boolean,
      webauthnEnabled: true,
    });
  });

  it('GET /api/v1/system/bootstrap returns phase-2b module catalog', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/system/bootstrap')
      .expect(200);
    expect(res.body).toMatchObject({
      phase: 'phase-2b',
      service: 'pokeverse-api',
    });
  });
});
