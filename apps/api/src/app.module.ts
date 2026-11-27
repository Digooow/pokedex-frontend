import * as path from 'node:path';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { CsrfOriginGuard } from './common/guards/csrf-origin.guard';
import { RbacGuard } from './common/guards/rbac.guard';
import { RedisThrottlerStorage } from './common/guards/redis-throttler.storage';
import { SessionAuthGuard } from './common/guards/session-auth.guard';
import { TrainerThrottlerGuard } from './common/guards/trainer-throttler.guard';
import { CorrelationMiddleware } from './common/middleware/correlation.middleware';
import { StructuredLoggerService } from './common/telemetry/structured-logger.service';
import { validateApiEnv } from './config/env.schema';
import { InfraModule } from './infra/infra.module';
import { RedisService } from './infra/redis.service';
import { AuthModule } from './modules/auth/auth.module';
import { CharactersModule } from './modules/characters/characters.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PokedexModule } from './modules/pokedex/pokedex.module';
import { SystemModule } from './modules/system/system.module';
import { WorldModule } from './modules/world/world.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), '.env.local'),
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '../../.env.local'),
        path.resolve(process.cwd(), '../../.env'),
        path.resolve(__dirname, '../../../../.env.local'),
        path.resolve(__dirname, '../../../../.env'),
      ],
      validate: validateApiEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [RedisService, StructuredLoggerService],
      useFactory: (redis: RedisService, logger: StructuredLoggerService) => ({
        throttlers: [
          {
            ttl: 60_000,
            limit: 120,
          },
        ],
        storage: new RedisThrottlerStorage(redis, logger),
      }),
    }),
    InfraModule,
    NotificationsModule,
    AuthModule,
    CharactersModule,
    PokedexModule,
    WorldModule,
    EventsModule,
    HealthModule,
    SystemModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: CsrfOriginGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_GUARD, useClass: TrainerThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
