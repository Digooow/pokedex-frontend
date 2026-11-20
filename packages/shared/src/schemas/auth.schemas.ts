import * as z from 'zod';

const NormalizedEmailSchema = z.string().trim().toLowerCase().pipe(z.email('E-mail inválido.'));
const SixDigitOtpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Informe o código numérico de 6 dígitos.');
const PasswordSchema = z
  .string()
  .min(8, 'A senha deve ter no mínimo 8 caracteres.')
  .max(128, 'A senha deve ter no máximo 128 caracteres.');

export const SessionAuthStateSchema = z.enum(['MFA_PENDING', 'AUTHENTICATED']);
export type SessionAuthState = z.infer<typeof SessionAuthStateSchema>;

export const MfaMethodSchema = z.enum(['totp', 'backup_code', 'passkey']);
export type MfaMethod = z.infer<typeof MfaMethodSchema>;

export const RegisterTrainerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Nome de treinador deve ter ao menos 3 caracteres.')
      .max(24, 'Nome de treinador deve ter no máximo 24 caracteres.')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Use apenas letras, números, "_" ou "-".'),
    email: NormalizedEmailSchema,
    password: PasswordSchema,
  })
  .strict();

export type RegisterTrainerInput = z.infer<typeof RegisterTrainerSchema>;

export const LoginTrainerSchema = z
  .object({
    email: NormalizedEmailSchema,
    password: z.string().min(1, 'Informe a senha.').max(128),
  })
  .strict();

export type LoginTrainerInput = z.infer<typeof LoginTrainerSchema>;

export const VerifyEmailOtpSchema = z
  .object({
    email: NormalizedEmailSchema,
    code: SixDigitOtpSchema,
  })
  .strict();

export type VerifyEmailOtpInput = z.infer<typeof VerifyEmailOtpSchema>;

export const ResendEmailOtpSchema = z
  .object({
    email: NormalizedEmailSchema,
  })
  .strict();

export type ResendEmailOtpInput = z.infer<typeof ResendEmailOtpSchema>;

export const ForgotPasswordSchema = z
  .object({
    email: NormalizedEmailSchema,
  })
  .strict();

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordOtpSchema = z
  .object({
    email: NormalizedEmailSchema,
    code: SixDigitOtpSchema,
    newPassword: PasswordSchema,
  })
  .strict();

export type ResetPasswordOtpInput = z.infer<typeof ResetPasswordOtpSchema>;

export const TrainerProfileSchema = z.object({
  id: z.uuid(),
  username: z.string().min(3).max(32),
  email: z.email(),
  emailVerifiedAt: z.iso.datetime().nullable(),
  mfaEnabled: z.boolean(),
  hasPassword: z.boolean(),
  badgesCount: z.number().int().nonnegative(),
  eloRating: z.number().int().nonnegative(),
  lastMapId: z.string().min(1),
  lastX: z.number().int(),
  lastY: z.number().int(),
  createdAt: z.iso.datetime(),
});

export type TrainerProfile = z.infer<typeof TrainerProfileSchema>;

export const AuthSessionResponseSchema = z.object({
  authenticated: z.literal(true),
  sessionState: SessionAuthStateSchema,
  mfaMethods: z.array(MfaMethodSchema),
  expiresInSec: z.number().int().positive(),
  trainer: TrainerProfileSchema,
});

export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

export const GuestSessionBootstrapSchema = z.object({
  authenticated: z.literal(false),
  canRefresh: z.boolean(),
});

export const SessionBootstrapResponseSchema = z.discriminatedUnion('authenticated', [
  AuthSessionResponseSchema,
  GuestSessionBootstrapSchema,
]);

export type SessionBootstrapResponse = z.infer<typeof SessionBootstrapResponseSchema>;

export const GenericMessageResponseSchema = z.object({
  message: z.string().min(1),
});

export type GenericMessageResponse = z.infer<typeof GenericMessageResponseSchema>;

export const TotpCodeInputSchema = z
  .object({
    code: SixDigitOtpSchema,
  })
  .strict();

export type TotpCodeInput = z.infer<typeof TotpCodeInputSchema>;

export const TotpSetupResponseSchema = z.object({
  secretBase32: z.string().min(16),
  otpauthUri: z.string().startsWith('otpauth://totp/'),
  qrDataUrl: z.string().startsWith('data:image/png;base64,'),
});

export type TotpSetupResponse = z.infer<typeof TotpSetupResponseSchema>;

export const TotpEnableResponseSchema = z.object({
  message: z.string().min(1),
  backupCodes: z.array(z.string().min(8)).length(8),
});

export type TotpEnableResponse = z.infer<typeof TotpEnableResponseSchema>;

export const MfaChallengeVerifySchema = z.discriminatedUnion('method', [
  z
    .object({
      method: z.literal('totp'),
      code: SixDigitOtpSchema,
    })
    .strict(),
  z
    .object({
      method: z.literal('backup_code'),
      code: z.string().trim().min(8, 'Código de backup inválido.').max(16),
    })
    .strict(),
]);

export type MfaChallengeVerifyInput = z.infer<typeof MfaChallengeVerifySchema>;

export const DisableTotpSchema = z
  .object({
    currentPassword: z.string().min(1).max(128).optional(),
    code: z.string().trim().min(6).max(16).optional(),
  })
  .strict()
  .refine((val) => Boolean(val.currentPassword || val.code), {
    message: 'Informe sua senha atual ou um código TOTP/backup para desativar.',
  });

export type DisableTotpInput = z.infer<typeof DisableTotpSchema>;

export const PasskeySummarySchema = z.object({
  id: z.uuid(),
  label: z.string().min(1).max(80),
  deviceType: z.string().min(1).max(32),
  backedUp: z.boolean(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
});

export type PasskeySummary = z.infer<typeof PasskeySummarySchema>;

export const SecurityOverviewResponseSchema = z.object({
  providers: z.object({
    googleEnabled: z.boolean(),
    googleLinked: z.boolean(),
    googleEmail: z.email().nullable(),
    webauthnEnabled: z.boolean(),
  }),
  mfaEnabled: z.boolean(),
  passkeys: z.array(PasskeySummarySchema),
});

export type SecurityOverviewResponse = z.infer<typeof SecurityOverviewResponseSchema>;

export const PasskeyRegisterVerifySchema = z
  .object({
    label: z.string().trim().min(1).max(60).optional(),
    response: z.record(z.string(), z.unknown()),
  })
  .strict();

export type PasskeyRegisterVerifyInput = z.infer<typeof PasskeyRegisterVerifySchema>;

export const PasskeyLoginOptionsSchema = z
  .object({
    email: NormalizedEmailSchema.optional(),
  })
  .strict();

export type PasskeyLoginOptionsInput = z.infer<typeof PasskeyLoginOptionsSchema>;

export const PasskeyLoginVerifySchema = z
  .object({
    challengeToken: z.string().min(16).max(256),
    response: z.record(z.string(), z.unknown()),
  })
  .strict();

export type PasskeyLoginVerifyInput = z.infer<typeof PasskeyLoginVerifySchema>;

export const AuthProvidersSchema = z.object({
  googleEnabled: z.boolean(),
  webauthnEnabled: z.boolean(),
});

export type AuthProviders = z.infer<typeof AuthProvidersSchema>;

export const PasskeyChallengeObjectSchema = z
  .record(z.string(), z.unknown())
  .refine((val) => typeof val['challenge'] === 'string', {
    message: 'Invalid WebAuthn challenge payload.',
  });

export const PasskeyAuthOptionsEnvelopeSchema = z.object({
  challengeToken: z.string().min(16),
  options: PasskeyChallengeObjectSchema,
});

