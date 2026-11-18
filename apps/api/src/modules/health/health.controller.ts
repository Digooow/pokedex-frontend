import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import {
  LivenessResponseSchema,
  ReadinessResponseSchema,
  type LivenessResponse,
  type ReadinessResponse,
} from '@pokeverse/shared';
import type { Response } from 'express';
import { InfraProbesService } from '../../infra/infra-probes.service';

@Controller('health')
export class HealthController {
  constructor(private readonly probes: InfraProbesService) {}

  @Get('live')
  getLiveness(): LivenessResponse {
    return LivenessResponseSchema.parse({
      status: 'ok',
      service: 'pokeverse-api',
      timestamp: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime() * 100) / 100,
    });
  }

  @Get('ready')
  async getReadiness(
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReadinessResponse> {
    const dependencies = await this.probes.checkAll();
    const depList = [
      dependencies.postgres,
      dependencies.redis,
      dependencies.kafka,
      dependencies.s3,
    ];
    const allUp = depList.every((item) => item.status === 'up');

    const payload = ReadinessResponseSchema.parse({
      status: allUp ? 'ok' : 'degraded',
      service: 'pokeverse-api',
      timestamp: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime() * 100) / 100,
      dependencies,
    });

    res.status(allUp ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return payload;
  }
}
