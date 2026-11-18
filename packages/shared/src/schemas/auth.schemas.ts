import { z } from 'zod';

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
