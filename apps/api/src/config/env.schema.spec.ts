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
      MAIL_TRANSPORT: 'resend',
      RESEND_API_KEY: '',
    };

    expect(() => validateApiEnv(broken)).toThrow(
      /APP_ENCRYPTION_KEY|DATABASE_URL|MINIO_ROOT_PASSWORD|RESEND_API_KEY/,
    );
  });
});
