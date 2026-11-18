import { z } from 'zod';

const BooleanFalseDefaultSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const BooleanTrueDefaultSchema = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

const ApiEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    CORS_ORIGINS: z
      .string()
      .min(1)
      .default('http://localhost:4200,http://127.0.0.1:4200'),
    APP_ENCRYPTION_KEY: z.string().min(32),
    SESSION_TTL_SEC: z.coerce.number().int().min(60).max(86400).default(900),
    REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    OTP_TTL_SEC: z.coerce.number().int().min(60).max(1800).default(600),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    COOKIE_SECURE: BooleanFalseDefaultSchema,
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_DOMAIN: z.string().optional().default(''),
    POKEAPI_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(30000)
      .default(8000),
    MAIL_TRANSPORT: z.enum(['smtp', 'resend']).default('smtp'),
    MAIL_FROM: z
      .string()
      .min(3)
      .default('PokéVerse OS <no-reply@pokeverse.local>'),
    SMTP_HOST: z.string().min(1).default('127.0.0.1'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_SECURE: BooleanFalseDefaultSchema,
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASS: z.string().optional().default(''),
    RESEND_API_KEY: z.string().optional().default(''),
    GOOGLE_CLIENT_ID: z.string().optional().default(''),
    GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
    GOOGLE_REDIRECT_URI: z
      .string()
      .optional()
      .default('http://127.0.0.1:4200/api/v1/auth/google/callback'),
    WEBAUTHN_RP_NAME: z.string().min(1).default('PokéVerse OS'),
    WEBAUTHN_RP_ID: z.string().min(1).default('127.0.0.1'),
    WEBAUTHN_ORIGIN: z.string().min(1).default('http://127.0.0.1:4200'),
    DATABASE_URL: z
      .url()
      .refine(
        (value) =>
          value.startsWith('postgresql://') || value.startsWith('postgres://'),
        'DATABASE_URL deve iniciar com postgresql:// ou postgres://.',
      ),
    DATABASE_URL_UNPOOLED: z.string().optional().default(''),
    REDIS_URL: z
      .url()
      .refine(
        (value) =>
          value.startsWith('redis://') || value.startsWith('rediss://'),
        'REDIS_URL deve iniciar com redis:// ou rediss://.',
      ),
    KAFKA_BROKERS: z.string().min(1),
    KAFKA_SSL: BooleanFalseDefaultSchema,
    KAFKA_SSL_CA_PEM: z.string().optional().default(''),
    KAFKA_SSL_CERT_PEM: z.string().optional().default(''),
    KAFKA_SSL_KEY_PEM: z.string().optional().default(''),
    KAFKA_SASL_MECHANISM: z
      .enum(['', 'plain', 'scram-sha-256', 'scram-sha-512'])
      .optional()
      .default(''),
    KAFKA_SASL_USERNAME: z.string().optional().default(''),
    KAFKA_SASL_PASSWORD: z.string().optional().default(''),
    KAFKA_CONNECT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(30000)
      .default(10000),
    KAFKA_REPLICATION_FACTOR: z.coerce.number().int().min(1).max(3).default(1),
    KAFKA_AUTO_CREATE_TOPICS: BooleanTrueDefaultSchema,
    S3_ENABLED: BooleanTrueDefaultSchema,
    S3_ENDPOINT: z.string().optional().default(''),
    MINIO_ROOT_USER: z.string().optional().default(''),
    MINIO_ROOT_PASSWORD: z.string().optional().default(''),
    S3_BUCKET_ROMS: z.string().min(1).default('pokeverse-roms'),
    S3_BUCKET_SAVES: z.string().min(1).default('pokeverse-saves'),
  })
  .superRefine((env, ctx) => {
    if (
      env.MAIL_TRANSPORT === 'resend' &&
      env.RESEND_API_KEY.trim().length < 8
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY é obrigatória quando MAIL_TRANSPORT=resend.',
      });
    }

    if (env.COOKIE_SAMESITE === 'none' && !env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message:
          'COOKIE_SECURE=true é obrigatório quando COOKIE_SAMESITE=none.',
      });
    }

    if (env.S3_ENABLED) {
      if (!z.url().safeParse(env.S3_ENDPOINT).success) {
        ctx.addIssue({
          code: 'custom',
          path: ['S3_ENDPOINT'],
          message: 'S3_ENDPOINT válido é obrigatório quando S3_ENABLED=true.',
        });
      }
      if (env.MINIO_ROOT_USER.trim().length < 3) {
        ctx.addIssue({
          code: 'custom',
          path: ['MINIO_ROOT_USER'],
          message: 'MINIO_ROOT_USER é obrigatório quando S3_ENABLED=true.',
        });
      }
      if (env.MINIO_ROOT_PASSWORD.trim().length < 8) {
        ctx.addIssue({
          code: 'custom',
          path: ['MINIO_ROOT_PASSWORD'],
          message:
            'MINIO_ROOT_PASSWORD (>= 8 caracteres) é obrigatória quando S3_ENABLED=true.',
        });
      }
    }

    if (
      env.KAFKA_SASL_MECHANISM.length > 0 &&
      (env.KAFKA_SASL_USERNAME.trim().length === 0 ||
        env.KAFKA_SASL_PASSWORD.trim().length === 0)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['KAFKA_SASL_USERNAME'],
        message:
          'KAFKA_SASL_USERNAME e KAFKA_SASL_PASSWORD são obrigatórios quando KAFKA_SASL_MECHANISM está definido.',
      });
    }

    const unpooledUrl = env.DATABASE_URL_UNPOOLED.trim();
    if (
      unpooledUrl.length > 0 &&
      (!z.url().safeParse(unpooledUrl).success ||
        (!unpooledUrl.startsWith('postgresql://') &&
          !unpooledUrl.startsWith('postgres://')))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL_UNPOOLED'],
        message:
          'DATABASE_URL_UNPOOLED deve iniciar com postgresql:// ou postgres:// quando definida.',
      });
    }
  });

export type ApiEnvConfig = z.infer<typeof ApiEnvSchema>;

/** Validates environment variables at boot without echoing secret values in error messages. */
export function validateApiEnv(rawEnv: Record<string, unknown>): ApiEnvConfig {
  const normalizedEnv =
    !rawEnv['API_PORT'] && rawEnv['PORT']
      ? { ...rawEnv, API_PORT: rawEnv['PORT'] }
      : rawEnv;

  const parsed = ApiEnvSchema.safeParse(normalizedEnv);
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
