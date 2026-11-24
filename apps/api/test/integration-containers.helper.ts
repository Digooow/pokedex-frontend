import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  RedisContainer,
  type StartedRedisContainer,
} from '@testcontainers/redis';
import {
  RedpandaContainer,
  type StartedRedpandaContainer,
} from '@testcontainers/redpanda';

export interface IntegrationBackingServicesHandle {
  readonly managedByTestcontainers: boolean;
  stop(): Promise<void>;
}

function applyTestDefaults(): void {
  process.env['NODE_ENV'] = 'test';
  process.env['API_PORT'] ??= '3000';
  process.env['CORS_ORIGINS'] ??= 'http://localhost:4200,http://127.0.0.1:4200';
  process.env['APP_ENCRYPTION_KEY'] ??=
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env['COOKIE_SECURE'] ??= 'false';
  process.env['COOKIE_SAMESITE'] ??= 'lax';
  process.env['MAIL_TRANSPORT'] ??= 'smtp';
  process.env['SMTP_HOST'] ??= '127.0.0.1';
  process.env['SMTP_PORT'] ??= '1025';
  process.env['SMTP_SECURE'] ??= 'false';
  process.env['S3_ENABLED'] ??= 'false';
}

export async function startIntegrationBackingServices(): Promise<IntegrationBackingServicesHandle> {
  applyTestDefaults();
  const shouldUseContainers =
    process.env['USE_TESTCONTAINERS'] === 'true' ||
    !process.env['DATABASE_URL'] ||
    !process.env['REDIS_URL'] ||
    !process.env['KAFKA_BROKERS'];

  if (!shouldUseContainers) {
    return {
      managedByTestcontainers: false,
      stop: () => Promise.resolve(),
    };
  }

  let pg: StartedPostgreSqlContainer | null = null;
  let redis: StartedRedisContainer | null = null;
  let redpanda: StartedRedpandaContainer | null = null;

  [pg, redis, redpanda] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
    new RedpandaContainer(
      'docker.redpanda.com/redpandadata/redpanda:v24.2.4',
    ).start(),
  ]);

  const databaseUrl = pg.getConnectionUri();
  process.env['DATABASE_URL'] = databaseUrl;
  process.env['DATABASE_URL_UNPOOLED'] = databaseUrl;
  process.env['REDIS_URL'] = redis.getConnectionUrl();
  process.env['KAFKA_BROKERS'] = redpanda.getBootstrapServers();

  const apiRoot = path.resolve(__dirname, '..');
  const prismaCli = path.resolve(
    apiRoot,
    '../../node_modules/prisma/build/index.js',
  );
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: process.env,
    stdio: 'inherit',
  });

  return {
    managedByTestcontainers: true,
    stop: async () => {
      await Promise.allSettled([pg?.stop(), redis?.stop(), redpanda?.stop()]);
    },
  };
}
