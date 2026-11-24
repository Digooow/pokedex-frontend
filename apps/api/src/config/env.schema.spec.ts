import { validateApiEnv } from './env.schema';

describe('validateApiEnv', () => {
  const validEnv: Record<string, unknown> = {
    NODE_ENV: 'test',
    API_PORT: '3000',
    CORS_ORIGINS: 'http://localhost:4200',
    APP_ENCRYPTION_KEY:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    SESSION_TTL_SEC: '900',
    REFRESH_TTL_DAYS: '7',
    OTP_TTL_SEC: '600',
    OTP_MAX_ATTEMPTS: '3',
    COOKIE_SECURE: 'false',
    POKEAPI_TIMEOUT_MS: '8000',
    MAIL_TRANSPORT: 'smtp',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '1025',
    DATABASE_URL: 'postgresql://user:pass@localhost:5433/db',
    REDIS_URL: 'redis://localhost:6379',
    KAFKA_BROKERS: 'localhost:19092',
    S3_ENDPOINT: 'http://localhost:9000',
    MINIO_ROOT_USER: 'pokeverse_minio',
    MINIO_ROOT_PASSWORD: 'min-8-chars-password',
    S3_BUCKET_ROMS: 'pokeverse-roms',
    S3_BUCKET_SAVES: 'pokeverse-saves',
  };

  it('parses valid environment configuration with numeric port and boolean coercion', () => {
    const parsed = validateApiEnv(validEnv);
    expect(parsed.API_PORT).toBe(3000);
    expect(parsed.COOKIE_SECURE).toBe(false);
    expect(parsed.MAIL_TRANSPORT).toBe('smtp');
    expect(parsed.OTP_MAX_ATTEMPTS).toBe(3);
  });

  it('rejects missing or short secrets without leaking secret values', () => {
    const broken = {
      ...validEnv,
      APP_ENCRYPTION_KEY: 'too-short',
      MINIO_ROOT_PASSWORD: 'short',
      DATABASE_URL: 'not-a-postgres-url',
      DATABASE_URL_UNPOOLED: 'not-a-direct-postgres-url',
      MAIL_TRANSPORT: 'resend',
      RESEND_API_KEY: '',
    };

    expect(() => validateApiEnv(broken)).toThrow(
      /APP_ENCRYPTION_KEY|DATABASE_URL|DATABASE_URL_UNPOOLED|MINIO_ROOT_PASSWORD|RESEND_API_KEY/,
    );
  });

  it('supports managed cloud URLs (rediss://, postgres://), PORT fallback, and S3_ENABLED=false', () => {
    const cloudEnv: Record<string, unknown> = {
      NODE_ENV: 'production',
      PORT: '8080',
      TRUST_PROXY: '1',
      CORS_ORIGINS: 'https://pokeverse.pages.dev',
      APP_ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      COOKIE_SECURE: 'true',
      COOKIE_SAMESITE: 'lax',
      DATABASE_URL:
        'postgres://user:pass@ep-cool-pooler.neon.tech/neondb?sslmode=require',
      DATABASE_URL_UNPOOLED:
        'postgresql://user:pass@ep-cool.neon.tech/neondb?sslmode=require',
      REDIS_URL: 'rediss://default:secret@cool-redis.upstash.io:6379',
      KAFKA_BROKERS: 'kafka-demo.aivencloud.com:12345',
      KAFKA_SSL: 'true',
      S3_ENABLED: 'false',
    };

    const parsed = validateApiEnv(cloudEnv);
    expect(parsed.API_PORT).toBe(8080);
    expect(parsed.TRUST_PROXY).toBe(1);
    expect(parsed.S3_ENABLED).toBe(false);
    expect(parsed.KAFKA_SSL).toBe(true);
    expect(parsed.DATABASE_URL_UNPOOLED).toBe(
      'postgresql://user:pass@ep-cool.neon.tech/neondb?sslmode=require',
    );
  });

  it('validates optional SENTRY_DSN and OTEL_SERVICE_VERSION format strictly', () => {
    const withSentry = validateApiEnv({
      ...validEnv,
      OTEL_SERVICE_VERSION: '1.4.0',
      SENTRY_DSN: 'https://publickey@o1.ingest.sentry.io/12345',
      SENTRY_ENVIRONMENT: 'production',
      SENTRY_RELEASE: 'pokeverse@1.4.0',
    });
    expect(withSentry.OTEL_SERVICE_VERSION).toBe('1.4.0');
    expect(withSentry.SENTRY_ENVIRONMENT).toBe('production');

    expect(() =>
      validateApiEnv({
        ...validEnv,
        SENTRY_DSN: 'http://insecure@o1.ingest.sentry.io/12345',
      }),
    ).toThrow(/SENTRY_DSN/);

    expect(() =>
      validateApiEnv({
        ...validEnv,
        SENTRY_DSN: 'https://o1.ingest.sentry.io/not-numeric',
      }),
    ).toThrow(/SENTRY_DSN/);
  });
});
