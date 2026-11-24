import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { TelemetryController } from './telemetry.controller';

@Module({
  controllers: [SystemController, TelemetryController],
})
export class SystemModule {}
