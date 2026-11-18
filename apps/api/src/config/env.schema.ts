import { z } from 'zod';

const ApiEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGINS: z
    .string()
    .min(1)
    .default('http://localhost:4200,http://127.0.0.1:4200'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SEC: z.coerce.number().int().min(60).max(86400).default(900),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  POKEAPI_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(30000)
    .default(8000),
  DATABASE_URL: z.url().startsWith('postgresql://'),
  REDIS_URL: z.url().startsWith('redis://'),
  KAFKA_BROKERS: z.string().min(1),
  S3_ENDPOINT: z.url(),
  MINIO_ROOT_USER: z.string().min(3),
  MINIO_ROOT_PASSWORD: z.string().min(8),
  S3_BUCKET_ROMS: z.string().min(1).default('pokeverse-roms'),
  S3_BUCKET_SAVES: z.string().min(1).default('pokeverse-saves'),
});

export type ApiEnvConfig = z.infer<typeof ApiEnvSchema>;

/** Validates environment variables at boot without echoing secret values in error messages. */
export function validateApiEnv(rawEnv: Record<string, unknown>): ApiEnvConfig {
  const parsed = ApiEnvSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const failedKeys = parsed.error.issues
      .map((issue) => issue.path.join('.') || 'env')
      .join(', ');
    throw new Error(
      `Invalid or missing API environment variables: ${failedKeys}`,
    );
  }
  return parsed.data;
}
