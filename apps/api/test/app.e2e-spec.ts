import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TelemetrySnapshotSchema } from '@pokeverse/shared';
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
          let count = 0;
          for (const key of keys) {
            if (sessionStore.delete(key)) {
              count += 1;
            }
          }
          return Promise.resolve(count);
        }),
        consumeString: jest.fn((key: string) => {
          const val = sessionStore.get(key) ?? null;
          sessionStore.delete(key);
          return Promise.resolve(val);
        }),
        consumeJson: jest.fn((key: string) => {
          const raw = sessionStore.get(key);
          sessionStore.delete(key);
          return Promise.resolve(raw ? (JSON.parse(raw) as unknown) : null);
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

    app = moduleRef.createNestApplication({ bodyParser: false });
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
    expect(res.headers['content-security-policy']).toContain(
      "default-src 'none'",
    );
    expect(res.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects oversized JSON payloads above 64kb with 413 and malformed JSON with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:4200')
      .send({ email: 'a@b.com', password: 'x'.repeat(70_000) })
      .expect(413);

    const malformed = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:4200')
      .set('Content-Type', 'application/json')
      .send('{invalid')
      .expect(400);
    expect(malformed.body).toMatchObject({ code: 'HTTP_400' });
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

  it('validates Pokedex route params at the HTTP edge via ZodValidationPipe', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/pokedex/pokemon/invalid!name')
      .expect(400);

    const sessionService = app.get(SessionService);
    const { rawSid } = await sessionService.createSession({
      trainerId: '550e8400-e29b-41d4-a716-446655440000',
      username: 'Red_Kanto',
      familyId: '550e8400-e29b-41d4-a716-446655440098',
      state: 'AUTHENTICATED',
      mfaMethods: [],
    });

    await request(app.getHttpServer())
      .put('/api/v1/pokedex/slots/10')
      .set('Origin', 'http://localhost:4200')
      .set('Cookie', `pokeverse_session=${rawSid}`)
      .send({ slotIndex: 9, pokemonId: 25, pokemonName: 'pikachu' })
      .expect(400);

    await request(app.getHttpServer())
      .delete('/api/v1/pokedex/slots/abc')
      .set('Origin', 'http://localhost:4200')
      .set('Cookie', `pokeverse_session=${rawSid}`)
      .expect(400);

    await request(app.getHttpServer())
      .put('/api/v1/pokedex/slots/2')
      .set('Origin', 'http://localhost:4200')
      .set('Cookie', `pokeverse_session=${rawSid}`)
      .send({ slotIndex: 3, pokemonId: 25, pokemonName: 'pikachu' })
      .expect(400);
  });

  it('validates Google OAuth callback query and Passkey UUID param at the HTTP edge via ZodValidationPipe', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback?code=abc&state=invalid!state')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback?code=a&code=b&state=valid_state')
      .expect(400);

    const cancelled = await request(app.getHttpServer())
      .get(
        '/api/v1/auth/google/callback?error=access_denied&scope=openid&authuser=0',
      )
      .expect(302);
    expect(cancelled.headers['location']).toContain(
      'authError=google_cancelled',
    );

    const sessionService = app.get(SessionService);
    const { rawSid } = await sessionService.createSession({
      trainerId: '550e8400-e29b-41d4-a716-446655440000',
      username: 'Red_Kanto',
      familyId: '550e8400-e29b-41d4-a716-446655440097',
      state: 'AUTHENTICATED',
      mfaMethods: [],
    });

    await request(app.getHttpServer())
      .delete('/api/v1/auth/passkeys/not-a-uuid')
      .set('Origin', 'http://localhost:4200')
      .set('Cookie', `pokeverse_session=${rawSid}`)
      .expect(400);
  });

  it('protects GET /api/v1/system/telemetry with RBAC and returns RED telemetry for ADMIN', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/system/telemetry')
      .expect(401);

    const sessionService = app.get(SessionService);
    const trainerSession = await sessionService.createSession({
      trainerId: '550e8400-e29b-41d4-a716-446655440001',
      username: 'Blue_Pallet',
      role: 'TRAINER',
      familyId: '550e8400-e29b-41d4-a716-446655440096',
      state: 'AUTHENTICATED',
      mfaMethods: [],
    });

    await request(app.getHttpServer())
      .get('/api/v1/system/telemetry')
      .set('Cookie', `pokeverse_session=${trainerSession.rawSid}`)
      .expect(403);

    const adminSession = await sessionService.createSession({
      trainerId: '550e8400-e29b-41d4-a716-446655440002',
      username: 'Oak_Admin',
      role: 'ADMIN',
      familyId: '550e8400-e29b-41d4-a716-446655440095',
      state: 'AUTHENTICATED',
      mfaMethods: [],
    });

    const telemetryRes = await request(app.getHttpServer())
      .get('/api/v1/system/telemetry')
      .set('Cookie', `pokeverse_session=${adminSession.rawSid}`)
      .expect(200);

    const parsed = TelemetrySnapshotSchema.safeParse(telemetryRes.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.service).toBe('pokeverse-api');
      expect(parsed.data.http.totalRequests).toBeGreaterThanOrEqual(1);
    }
  });

  it('ingests validated RUM samples and client error reports on /api/v1/telemetry/* and rejects invalid payloads', async () => {
    const rumRes = await request(app.getHttpServer())
      .post('/api/v1/telemetry/rum')
      .set('Origin', 'http://localhost:4200')
      .send({
        samples: [
          { name: 'LCP', value: 980, route: '/pokedex', tier: 'ULTRA' },
        ],
        traceId: 'a'.repeat(32),
      })
      .expect(202);
    expect(rumRes.body).toMatchObject({ accepted: true, count: 1 });

    await request(app.getHttpServer())
      .post('/api/v1/telemetry/rum')
      .set('Origin', 'http://localhost:4200')
      .send({
        samples: [{ name: 'LCP', value: 100, route: 'bad', tier: 'ULTRA' }],
      })
      .expect(400);

    const errRes = await request(app.getHttpServer())
      .post('/api/v1/telemetry/errors')
      .set('Origin', 'http://localhost:4200')
      .send({
        name: 'TypeError',
        message: 'Unexpected null sprite',
        route: '/pokedex',
        tier: 'BALANCED',
      })
      .expect(202);
    expect(errRes.body).toMatchObject({ accepted: true, count: 1 });
  });
});
