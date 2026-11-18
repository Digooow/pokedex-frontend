import { z } from 'zod';

const BooleanStringSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const ApiEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    CORS_ORIGINS: z
      .string()
      .min(1)
      .default('http://localhost:4200,http://127.0.0.1:4200'),
    APP_ENCRYPTION_KEY: z.string().min(32),
    SESSION_TTL_SEC: z.coerce.number().int().min(60).max(86400).default(900),
    REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    OTP_TTL_SEC: z.coerce.number().int().min(60).max(1800).default(600),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    COOKIE_SECURE: BooleanStringSchema,
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
    SMTP_SECURE: BooleanStringSchema,
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
    DATABASE_URL: z.url().startsWith('postgresql://'),
    REDIS_URL: z.url().startsWith('redis://'),
    KAFKA_BROKERS: z.string().min(1),
    S3_ENDPOINT: z.url(),
    MINIO_ROOT_USER: z.string().min(3),
    MINIO_ROOT_PASSWORD: z.string().min(8),
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
