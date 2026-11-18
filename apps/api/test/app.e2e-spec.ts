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
      .overrideProvider(InfraProbesService)
      .useValue({
        checkAll: jest.fn().mockResolvedValue(healthyChecks),
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
