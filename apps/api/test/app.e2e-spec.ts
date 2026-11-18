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

describe('PokéVerse API (e2e)', () => {
  let app: INestApplication<App>;

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
        getJson: jest.fn().mockResolvedValue(null),
        setJsonEx: jest.fn(),
        acquireIdempotencyLock: jest.fn().mockResolvedValue(true),
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
    configureApiApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live returns 200 ok with correlation headers', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'pokeverse-api' });
    expect(res.headers['x-correlation-id']).toBeTruthy();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
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

  it('blocks unauthenticated visitors with 401 on protected endpoints', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    await request(app.getHttpServer()).get('/api/v1/pokedex/slots').expect(401);
    await request(app.getHttpServer())
      .put('/api/v1/pokedex/slots/0')
      .send({ slotIndex: 0, pokemonId: 25, pokemonName: 'pikachu' })
      .expect(401);
  });

  it('GET /api/v1/system/bootstrap returns phase-1 module catalog', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/system/bootstrap')
      .expect(200);
    expect(res.body).toMatchObject({
      phase: 'phase-1',
      service: 'pokeverse-api',
    });
  });
});
