import {
  type ForgotPasswordInput,
  ForgotPasswordSchema,
  type LoginTrainerInput,
  LoginTrainerSchema,
  type MfaChallengeVerifyInput,
  MfaChallengeVerifySchema,
  type RegisterTrainerInput,
  RegisterTrainerSchema,
  type ResendEmailOtpInput,
  ResendEmailOtpSchema,
  type ResetPasswordOtpInput,
  ResetPasswordOtpSchema,
  type VerifyEmailOtpInput,
  VerifyEmailOtpSchema,
} from '@pokeverse/shared';
import type { AuthDialogMode } from '../../core/stores/auth.store';

export interface AuthDialogDraft {
  readonly mode: AuthDialogMode;
  readonly username: string;
  readonly email: string;
  readonly password: string;
  readonly otpCode: string;
  readonly useBackupCode: boolean;
  readonly resetCodeRequested: boolean;
}

export type AuthDialogCommand =
  | { readonly kind: 'login'; readonly data: LoginTrainerInput }
  | { readonly kind: 'register'; readonly data: RegisterTrainerInput }
  | { readonly kind: 'mfa-challenge'; readonly data: MfaChallengeVerifyInput }
  | { readonly kind: 'verify-email'; readonly data: VerifyEmailOtpInput }
  | { readonly kind: 'forgot-request'; readonly data: ForgotPasswordInput }
  | { readonly kind: 'forgot-reset'; readonly data: ResetPasswordOtpInput };

export type AuthDialogValidationResult =
  | { readonly ok: true; readonly command: AuthDialogCommand }
  | { readonly ok: false; readonly error: string };

export function validateResendVerificationEmail(
  email: string,
): { readonly ok: true; readonly data: ResendEmailOtpInput } | { readonly ok: false; readonly error: string } {
  const parsed = ResendEmailOtpSchema.safeParse({ email });
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: parsed.error.issues[0]?.message ?? 'E-mail inválido.' };
}

export function validateForgotPasswordEmail(
  email: string,
): { readonly ok: true; readonly data: ForgotPasswordInput } | { readonly ok: false; readonly error: string } {
  const parsed = ForgotPasswordSchema.safeParse({ email });
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: parsed.error.issues[0]?.message ?? 'E-mail inválido.' };
}

export function validateAuthDialogSubmission(draft: AuthDialogDraft): AuthDialogValidationResult {
  if (draft.mode === 'mfa-challenge') {
    const parsed = MfaChallengeVerifySchema.safeParse({
      method: draft.useBackupCode ? 'backup_code' : 'totp',
      code: draft.otpCode,
    });
    return parsed.success
      ? { ok: true, command: { kind: 'mfa-challenge', data: parsed.data } }
      : { ok: false, error: parsed.error.issues[0]?.message ?? 'Código 2FA inválido.' };
  }

  if (draft.mode === 'register') {
    const parsed = RegisterTrainerSchema.safeParse({
      username: draft.username,
      email: draft.email,
      password: draft.password,
    });
    return parsed.success
      ? { ok: true, command: { kind: 'register', data: parsed.data } }
      : { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  if (draft.mode === 'verify-email') {
    const parsed = VerifyEmailOtpSchema.safeParse({ email: draft.email, code: draft.otpCode });
    return parsed.success
      ? { ok: true, command: { kind: 'verify-email', data: parsed.data } }
      : { ok: false, error: parsed.error.issues[0]?.message ?? 'Código OTP inválido.' };
  }

  if (draft.mode === 'forgot') {
    if (!draft.resetCodeRequested) {
      const forgot = validateForgotPasswordEmail(draft.email);
      return forgot.ok
        ? { ok: true, command: { kind: 'forgot-request', data: forgot.data } }
        : forgot;
    }
    const parsed = ResetPasswordOtpSchema.safeParse({
      email: draft.email,
      code: draft.otpCode,
      newPassword: draft.password,
    });
    return parsed.success
      ? { ok: true, command: { kind: 'forgot-reset', data: parsed.data } }
      : { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  const parsed = LoginTrainerSchema.safeParse({ email: draft.email, password: draft.password });
  return parsed.success
    ? { ok: true, command: { kind: 'login', data: parsed.data } }
    : { ok: false, error: parsed.error.issues[0]?.message ?? 'Credenciais inválidas.' };
}
