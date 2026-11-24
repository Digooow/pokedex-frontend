import { Module } from '@nestjs/common';
import { ClientTelemetryController } from './client-telemetry.controller';
import { SystemController } from './system.controller';
import { TelemetryIngestionService } from './telemetry-ingestion.service';
import { TelemetryController } from './telemetry.controller';

@Module({
  controllers: [
    SystemController,
    TelemetryController,
    ClientTelemetryController,
  ],
  providers: [TelemetryIngestionService],
})
export class SystemModule {}
