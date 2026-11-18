import * as path from 'node:path';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CorrelationMiddleware } from './common/middleware/correlation.middleware';
import { StructuredLoggerService } from './common/telemetry/structured-logger.service';
import { validateApiEnv } from './config/env.schema';
import { InfraModule } from './infra/infra.module';
import { HealthModule } from './modules/health/health.module';
import { SystemModule } from './modules/system/system.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '../../.env'),
        path.resolve(__dirname, '../../../../.env'),
      ],
      validate: validateApiEnv,
    }),
    InfraModule,
    HealthModule,
    SystemModule,
  ],
  providers: [StructuredLoggerService],
  exports: [StructuredLoggerService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
