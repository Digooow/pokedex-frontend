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
):
  | { readonly ok: true; readonly data: ResendEmailOtpInput }
  | { readonly ok: false; readonly error: string } {
  const parsed = ResendEmailOtpSchema.safeParse({ email });
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: parsed.error.issues[0]?.message ?? 'E-mail inválido.' };
}

export function validateForgotPasswordEmail(
  email: string,
):
  | { readonly ok: true; readonly data: ForgotPasswordInput }
  | { readonly ok: false; readonly error: string } {
  const parsed = ForgotPasswordSchema.safeParse({ email });
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: parsed.error.issues[0]?.message ?? 'E-mail inválido.' };
}

export function validateAuthDialogSubmission(draft: AuthDialogDraft): AuthDialogValidationResult {
  return DIALOG_VALIDATORS[draft.mode](draft);
}

interface SafeParseSchema<T> {
  safeParse(input: unknown):
    | { readonly success: true; readonly data: T }
    | {
        readonly success: false;
        readonly error: { readonly issues: ReadonlyArray<{ readonly message?: string }> };
      };
}

function parseDialogCommand<T>(
  schema: SafeParseSchema<T>,
  payload: unknown,
  fallbackError: string,
  toCommand: (data: T) => AuthDialogCommand,
): AuthDialogValidationResult {
  const parsed = schema.safeParse(payload);
  return parsed.success
    ? { ok: true, command: toCommand(parsed.data) }
    : { ok: false, error: parsed.error.issues[0]?.message ?? fallbackError };
}

const DIALOG_VALIDATORS: Readonly<
  Record<AuthDialogMode, (draft: AuthDialogDraft) => AuthDialogValidationResult>
> = {
  'mfa-challenge': (draft) =>
    parseDialogCommand(
      MfaChallengeVerifySchema,
      { method: draft.useBackupCode ? 'backup_code' : 'totp', code: draft.otpCode },
      'Código 2FA inválido.',
      (data) => ({ kind: 'mfa-challenge', data }),
    ),
  register: (draft) =>
    parseDialogCommand(
      RegisterTrainerSchema,
      { username: draft.username, email: draft.email, password: draft.password },
      'Dados inválidos.',
      (data) => ({ kind: 'register', data }),
    ),
  'verify-email': (draft) =>
    parseDialogCommand(
      VerifyEmailOtpSchema,
      { email: draft.email, code: draft.otpCode },
      'Código OTP inválido.',
      (data) => ({ kind: 'verify-email', data }),
    ),
  forgot: (draft) => {
    if (!draft.resetCodeRequested) {
      const forgot = validateForgotPasswordEmail(draft.email);
      return forgot.ok
        ? { ok: true, command: { kind: 'forgot-request', data: forgot.data } }
        : forgot;
    }
    return parseDialogCommand(
      ResetPasswordOtpSchema,
      { email: draft.email, code: draft.otpCode, newPassword: draft.password },
      'Dados inválidos.',
      (data) => ({ kind: 'forgot-reset', data }),
    );
  },
  login: (draft) =>
    parseDialogCommand(
      LoginTrainerSchema,
      { email: draft.email, password: draft.password },
      'Credenciais inválidas.',
      (data) => ({ kind: 'login', data }),
    ),
};
