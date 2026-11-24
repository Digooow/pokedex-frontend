import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OutboxStatus } from '@prisma/client';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApiApp } from '../src/app.setup';
import { CryptoService } from '../src/common/security/crypto.service';
import { OpenTelemetryService } from '../src/common/telemetry/opentelemetry.service';
import { PrismaService } from '../src/infra/prisma.service';
import { RedisService } from '../src/infra/redis.service';
import { S3ObjectStorageAdapter } from '../src/infra/s3-object-storage.adapter';
import { OutboxRelayService } from '../src/modules/events/outbox-relay.service';
import {
  type IntegrationBackingServicesHandle,
  startIntegrationBackingServices,
} from './integration-containers.helper';

jest.setTimeout(120_000);

function extractCookieMap(res: Response): Map<string, string> {
  const headersRecord = res.headers as Record<string, unknown>;
  const rawSetCookie = headersRecord['set-cookie'];
  let entries: string[] = [];
  if (Array.isArray(rawSetCookie)) {
    entries = rawSetCookie.filter(
      (item): item is string => typeof item === 'string',
    );
  } else if (typeof rawSetCookie === 'string') {
    entries = [rawSetCookie];
  }

  const jar = new Map<string, string>();
  for (const headerLine of entries) {
    const firstPart = headerLine.split(';')[0] ?? '';
    const eqIdx = firstPart.indexOf('=');
    if (eqIdx > 0) {
      jar.set(
        firstPart.slice(0, eqIdx).trim(),
        firstPart.slice(eqIdx + 1).trim(),
      );
    }
  }
  return jar;
}

function formatCookieHeader(jar: ReadonlyMap<string, string>): string {
  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

describe('PokéVerse API Integration E2E (Real Postgres + Redis + Kafka)', () => {
  let backingHandle: IntegrationBackingServicesHandle | null = null;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;
  let crypto: CryptoService;
  let outboxRelay: OutboxRelayService;
  let telemetry: OpenTelemetryService;
  let objectStorage: S3ObjectStorageAdapter;
  const suffix = randomUUID().slice(0, 8);
  const trainerEmail = `integration-${suffix}@pokeverse.local`;
  const trainerUsername = `Int_${suffix}`;

  beforeAll(async () => {
    backingHandle = await startIntegrationBackingServices();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApiApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    crypto = app.get(CryptoService);
    outboxRelay = app.get(OutboxRelayService);
    telemetry = app.get(OpenTelemetryService);
    objectStorage = app.get(S3ObjectStorageAdapter);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.trainer
        .deleteMany({ where: { email: trainerEmail } })
        .catch(() => undefined);
      await prisma.outboxEvent
        .deleteMany({ where: { status: OutboxStatus.PUBLISHED } })
        .catch(() => undefined);
    }
    if (app) {
      await app.close();
    }
    if (backingHandle) {
      await backingHandle.stop();
    }
  });

  it('GET /health/ready probes real PostgreSQL, Redis, Kafka, and S3 storage', async () => {
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

  it('registers trainer in PostgreSQL + Redis, protects OTP on P2002 conflict, rotates refresh, persists slots, relays Outbox to Kafka, and executes LGPD deletion', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:4200')
      .send({
        username: trainerUsername,
        email: trainerEmail,
        password: 'StrongPassword123!',
      })
      .expect(201);

    const registerBody = registerRes.body as {
      readonly trainer: { readonly id: string; readonly email: string };
      readonly sessionState: string;
    };
    expect(registerBody.sessionState).toBe('AUTHENTICATED');
    expect(registerBody.trainer.email).toBe(trainerEmail);

    const trainerId = registerBody.trainer.id;
    const cookieJar = extractCookieMap(registerRes);
    expect(cookieJar.get('pokeverse_session')).toBeTruthy();
    expect(cookieJar.get('pokeverse_refresh')).toBeTruthy();

    const otpKey = `otp:verify:${crypto.sha256Hex(trainerEmail)}`;
    const initialOtp = await redis.getString(otpKey);
    expect(initialOtp).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:4200')
      .send({
        username: trainerUsername,
        email: trainerEmail,
        password: 'StrongPassword123!',
      })
      .expect(409);

    expect(await redis.getString(otpKey)).toBe(initialOtp);

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', formatCookieHeader(cookieJar))
      .expect(200);
    expect((meRes.body as { readonly id: string }).id).toBe(trainerId);

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:4200')
      .set('Cookie', formatCookieHeader(cookieJar))
      .expect(200);

    const refreshedCookies = extractCookieMap(refreshRes);
    for (const [k, v] of refreshedCookies.entries()) {
      cookieJar.set(k, v);
    }

    const dbTokens = await prisma.refreshToken.findMany({
      where: { trainerId },
    });
    expect(dbTokens).toHaveLength(2);
    expect(dbTokens.filter((t) => t.revokedAt !== null)).toHaveLength(1);

    await request(app.getHttpServer())
      .put('/api/v1/pokedex/slots/0')
      .set('Origin', 'http://localhost:4200')
      .set('Cookie', formatCookieHeader(cookieJar))
      .send({
        slotIndex: 0,
        pokemonId: 25,
        pokemonName: 'pikachu',
        nickname: 'Sparky',
      })
      .expect(200);

    await request(app.getHttpServer())
      .put('/api/v1/pokedex/slots/1')
      .set('Origin', 'http://localhost:4200')
      .set('Cookie', formatCookieHeader(cookieJar))
      .send({
        slotIndex: 1,
        pokemonId: 25,
        pokemonName: 'pikachu',
      })
      .expect(409);

    await request(app.getHttpServer())
      .delete('/api/v1/pokedex/slots')
      .set('Origin', 'http://localhost:4200')
      .set('Cookie', formatCookieHeader(cookieJar))
      .expect(204);

    const relayRuns = await Promise.all([
      outboxRelay.processPendingBatch(),
      outboxRelay.processPendingBatch(),
    ]);
    const relayedCount = relayRuns[0] + relayRuns[1];
    expect(relayedCount).toBeGreaterThanOrEqual(4);

    const publishedEvents = await prisma.outboxEvent.findMany({
      where: { status: OutboxStatus.PUBLISHED },
    });
    expect(publishedEvents.length).toBeGreaterThanOrEqual(4);

    const otelSnapshot = telemetry.getSnapshot();
    expect(otelSnapshot.http.totalRequests).toBeGreaterThanOrEqual(5);
    expect(otelSnapshot.database.queryCount).toBeGreaterThanOrEqual(1);
    expect(otelSnapshot.messaging.publishedCount).toBeGreaterThanOrEqual(4);

    await request(app.getHttpServer())
      .delete('/api/v1/auth/me')
      .set('Origin', 'http://localhost:4200')
      .set('Cookie', formatCookieHeader(cookieJar))
      .expect(200);

    const deletedTrainer = await prisma.trainer.findUnique({
      where: { id: trainerId },
    });
    expect(deletedTrainer).toBeNull();

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', formatCookieHeader(cookieJar))
      .expect(401);

    await redis.delKeys(otpKey);
  });

  it('executes atomic Redis Lua counters and GETDEL one-time consumption under concurrency', async () => {
    const counterKey = `test:lua:counter:${suffix}`;
    const oneTimeKey = `test:getdel:once:${suffix}`;

    const counts = await Promise.all([
      redis.incrementCounterWithTtl(counterKey, 30),
      redis.incrementCounterWithTtl(counterKey, 30),
      redis.incrementCounterWithTtl(counterKey, 30),
    ]);
    expect(counts.slice().sort((a, b) => a - b)).toEqual([1, 2, 3]);

    await redis.setStringEx(oneTimeKey, 30, 'single-use-secret');
    const consumed = await Promise.all([
      redis.consumeString(oneTimeKey),
      redis.consumeString(oneTimeKey),
    ]);
    expect(consumed.filter((val) => val === 'single-use-secret')).toHaveLength(
      1,
    );
    expect(consumed.filter((val) => val === null)).toHaveLength(1);

    await redis.delKeys(counterKey, oneTimeKey);
  });

  it('uploads, verifies SHA-256 metadata, blocks traversal, and deletes objects in real S3/MinIO storage', async () => {
    if (!objectStorage.isEnabled()) {
      return;
    }

    const bucket = process.env['S3_BUCKET_SAVES'] ?? 'pokeverse-saves';
    const key = `saves/${suffix}/emerald-slot-1.sav`;
    const binaryPayload = Buffer.from(`pokeverse-save-${suffix}`);
    const expectedSha = createHash('sha256')
      .update(binaryPayload)
      .digest('hex');

    const stored = await objectStorage.putObject({
      bucket,
      key,
      body: binaryPayload,
      contentType: 'application/octet-stream',
    });
    expect(stored.sha256).toBe(expectedSha);

    const fetched = await objectStorage.headObject(bucket, key);
    expect(fetched).toEqual({
      key,
      contentLength: binaryPayload.byteLength,
      contentType: 'application/octet-stream',
      sha256: expectedSha,
    });

    await expect(
      objectStorage.putObject({
        bucket,
        key: '../escape.sav',
        body: binaryPayload,
        contentType: 'application/octet-stream',
      }),
    ).rejects.toThrow(BadRequestException);

    await objectStorage.deleteObject(bucket, key);
    expect(await objectStorage.headObject(bucket, key)).toBeNull();
  });
});
