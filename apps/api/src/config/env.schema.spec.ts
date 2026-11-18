import { validateApiEnv } from './env.schema';

describe('validateApiEnv', () => {
  const validEnv: Record<string, unknown> = {
    NODE_ENV: 'test',
    API_PORT: '3000',
    CORS_ORIGINS: 'http://localhost:4200',
    DATABASE_URL: 'postgresql://user:pass@localhost:5433/db',
    REDIS_URL: 'redis://localhost:6379',
    KAFKA_BROKERS: 'localhost:19092',
    S3_ENDPOINT: 'http://localhost:9000',
    MINIO_ROOT_USER: 'pokeverse_minio',
    MINIO_ROOT_PASSWORD: 'min-8-chars-password',
    S3_BUCKET_ROMS: 'pokeverse-roms',
    S3_BUCKET_SAVES: 'pokeverse-saves',
  };

  it('parses valid environment configuration with numeric port coercion', () => {
    const parsed = validateApiEnv(validEnv);
    expect(parsed.API_PORT).toBe(3000);
    expect(parsed.S3_BUCKET_ROMS).toBe('pokeverse-roms');
  });

  it('rejects missing or short secrets without leaking secret values', () => {
    const broken = {
      ...validEnv,
      MINIO_ROOT_PASSWORD: 'short',
      DATABASE_URL: 'not-a-postgres-url',
    };

    expect(() => validateApiEnv(broken)).toThrow(
      /DATABASE_URL|MINIO_ROOT_PASSWORD/,
    );
  });
});
