import { Controller, Get, Inject } from '@nestjs/common';
import type { TelemetrySnapshot } from '@pokeverse/shared';
import { Roles, Scopes } from '../../common/decorators/rbac.decorator';
import {
  TELEMETRY_METRICS_PORT,
  type TelemetryMetricsPort,
} from '../../common/telemetry/telemetry.port';

@Roles('MODERATOR', 'ADMIN')
@Scopes('ops:audit')
@Controller('system')
export class TelemetryController {
  constructor(
    @Inject(TELEMETRY_METRICS_PORT)
    private readonly telemetry: TelemetryMetricsPort,
  ) {}

  @Get('telemetry')
  getTelemetry(): TelemetrySnapshot {
    return this.telemetry.getSnapshot();
  }
}
