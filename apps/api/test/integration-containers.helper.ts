import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';

export interface IntegrationBackingServicesHandle {
  readonly managedByTestcontainers: boolean;
  stop(): Promise<void>;
}

const DEFAULT_S3_USER = 'minioadmin';
const DEFAULT_S3_PASS = 'minioadmin_tc_secret';
const DEFAULT_S3_ROMS_BUCKET = 'pokeverse-roms';
const DEFAULT_S3_SAVES_BUCKET = 'pokeverse-saves';

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
  process.env['S3_BUCKET_ROMS'] ??= DEFAULT_S3_ROMS_BUCKET;
  process.env['S3_BUCKET_SAVES'] ??= DEFAULT_S3_SAVES_BUCKET;
}

async function ensureIntegrationBuckets(): Promise<void> {
  if (process.env['S3_ENABLED'] !== 'true') {
    return;
  }
  const client = new S3Client({
    region: 'us-east-1',
    endpoint: process.env['S3_ENDPOINT'],
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env['MINIO_ROOT_USER'] ?? DEFAULT_S3_USER,
      secretAccessKey: process.env['MINIO_ROOT_PASSWORD'] ?? DEFAULT_S3_PASS,
    },
  });

  const buckets = [
    process.env['S3_BUCKET_ROMS'] ?? DEFAULT_S3_ROMS_BUCKET,
    process.env['S3_BUCKET_SAVES'] ?? DEFAULT_S3_SAVES_BUCKET,
  ];
  try {
    for (const bucket of buckets) {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    }
  } finally {
    client.destroy();
  }
}

export async function startIntegrationBackingServices(): Promise<IntegrationBackingServicesHandle> {
  applyTestDefaults();
  const shouldUseContainers =
    process.env['USE_TESTCONTAINERS'] === 'true' ||
    !process.env['DATABASE_URL'] ||
    !process.env['REDIS_URL'] ||
    !process.env['KAFKA_BROKERS'];

  if (!shouldUseContainers) {
    process.env['S3_ENABLED'] ??= 'false';
    await ensureIntegrationBuckets();
    return {
      managedByTestcontainers: false,
      stop: () => Promise.resolve(),
    };
  }

  let pg: StartedPostgreSqlContainer | null = null;
  let redis: StartedRedisContainer | null = null;
  let redpanda: StartedRedpandaContainer | null = null;
  let silo: StartedTestContainer | null = null;

  [pg, redis, redpanda, silo] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
    new RedpandaContainer(
      'docker.redpanda.com/redpandadata/redpanda:v24.2.4',
    ).start(),
    new GenericContainer('pgsty/silo:RELEASE.2026-11-12T00-00-00Z')
      .withEnvironment({
        MINIO_ROOT_USER: DEFAULT_S3_USER,
        MINIO_ROOT_PASSWORD: DEFAULT_S3_PASS,
      })
      .withCommand(['server', '/data'])
      .withExposedPorts(9000)
      .withWaitStrategy(
        Wait.forHttp('/minio/health/live', 9000).forStatusCode(200),
      )
      .start(),
  ]);

  const databaseUrl = pg.getConnectionUri();
  process.env['DATABASE_URL'] = databaseUrl;
  process.env['DATABASE_URL_UNPOOLED'] = databaseUrl;
  process.env['REDIS_URL'] = redis.getConnectionUrl();
  process.env['KAFKA_BROKERS'] = redpanda.getBootstrapServers();
  process.env['S3_ENABLED'] = 'true';
  process.env['S3_ENDPOINT'] =
    `http://${silo.getHost()}:${silo.getMappedPort(9000)}`;
  process.env['MINIO_ROOT_USER'] = DEFAULT_S3_USER;
  process.env['MINIO_ROOT_PASSWORD'] = DEFAULT_S3_PASS;

  await ensureIntegrationBuckets();

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
      await Promise.allSettled([
        pg?.stop(),
        redis?.stop(),
        redpanda?.stop(),
        silo?.stop(),
      ]);
    },
  };
}
