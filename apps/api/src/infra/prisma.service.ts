import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  TELEMETRY_METRICS_PORT,
  type TelemetryMetricsPort,
} from '../common/telemetry/telemetry.port';

interface PrismaQueryTelemetryEvent {
  readonly target?: string;
  readonly duration: number;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    @Optional()
    @Inject(TELEMETRY_METRICS_PORT)
    private readonly telemetry?: TelemetryMetricsPort,
  ) {
    super({
      log: [{ emit: 'event', level: 'query' }],
    });
    this.$on('query' as never, (event: PrismaQueryTelemetryEvent) => {
      this.telemetry?.recordDatabaseQuery(
        event.target ?? 'prisma',
        event.duration,
      );
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
