import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import helmet from 'helmet';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { StructuredLoggerService } from './common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from './config/env.schema';

/** Applies security headers, payload limits, cookies, CORS, global prefix, exception filter, and shutdown hooks. */
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

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()',
    );
    next();
  });

  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ limit: '16kb', extended: false }));
  app.use(cookieParser());
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
