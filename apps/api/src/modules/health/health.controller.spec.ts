import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import {
  InfraProbesService,
  type ReadinessChecks,
} from '../../infra/infra-probes.service';
import { HealthController } from './health.controller';

function createMockResponse(): {
  readonly statusCalls: number[];
  readonly res: Response;
} {
  const statusCalls: number[] = [];
  const res = {
    status(code: number) {
      statusCalls.push(code);
      return this;
    },
  } as unknown as Response;
  return { statusCalls, res };
}

describe('HealthController', () => {
  it('returns ok on /health/live', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: InfraProbesService,
          useValue: { checkAll: jest.fn() },
        },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const live = controller.getLiveness();

    expect(live.status).toBe('ok');
    expect(live.service).toBe('pokeverse-api');
    await moduleRef.close();
  });

  it('returns 200 ok when all dependencies are up', async () => {
    const allUp: ReadinessChecks = {
      postgres: { status: 'up', latencyMs: 4 },
      redis: { status: 'up', latencyMs: 1 },
      kafka: { status: 'up', latencyMs: 11 },
      s3: { status: 'up', latencyMs: 6 },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: InfraProbesService,
          useValue: { checkAll: jest.fn().mockResolvedValue(allUp) },
        },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const { statusCalls, res } = createMockResponse();

    const result = await controller.getReadiness(res);
    expect(statusCalls).toEqual([HttpStatus.OK]);
    expect(result.status).toBe('ok');
    await moduleRef.close();
  });

  it('returns 503 degraded when any dependency is down', async () => {
    const partialDown: ReadinessChecks = {
      postgres: {
        status: 'down',
        latencyMs: 1500,
        detail: 'PostgreSQL unreachable',
      },
      redis: { status: 'up', latencyMs: 2 },
      kafka: { status: 'up', latencyMs: 9 },
      s3: { status: 'up', latencyMs: 5 },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: InfraProbesService,
          useValue: { checkAll: jest.fn().mockResolvedValue(partialDown) },
        },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const { statusCalls, res } = createMockResponse();

    const result = await controller.getReadiness(res);
    expect(statusCalls).toEqual([HttpStatus.SERVICE_UNAVAILABLE]);
    expect(result.status).toBe('degraded');
    expect(result.dependencies.postgres.status).toBe('down');
    await moduleRef.close();
  });
});
