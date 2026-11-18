import * as path from 'node:path';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CorrelationMiddleware } from './common/middleware/correlation.middleware';
import { validateApiEnv } from './config/env.schema';
import { InfraModule } from './infra/infra.module';
import { AuthModule } from './modules/auth/auth.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { PokedexModule } from './modules/pokedex/pokedex.module';
import { SystemModule } from './modules/system/system.module';
import { WorldModule } from './modules/world/world.module';

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
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    InfraModule,
    AuthModule,
    PokedexModule,
    WorldModule,
    EventsModule,
    HealthModule,
    SystemModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
