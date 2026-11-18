import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { StructuredLoggerService } from './common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from './config/env.schema';

/** Applies security headers, CORS, global prefix, exception filter, and shutdown hooks. */
export function configureApiApp(app: INestApplication): {
  readonly port: number;
  readonly logger: StructuredLoggerService;
} {
  const logger = app.get(StructuredLoggerService);
  const config = app.get<ConfigService<ApiEnvConfig, true>>(ConfigService);

  const allowedOrigins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(helmet());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.setGlobalPrefix('api/v1', {
    exclude: ['health/live', 'health/ready'],
  });
  app.useGlobalFilters(new GlobalExceptionFilter(logger));
  app.enableShutdownHooks();

  return {
    port: config.get('API_PORT', { infer: true }),
    logger,
  };
}
