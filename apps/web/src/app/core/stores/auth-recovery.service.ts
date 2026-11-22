import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  AuthProvidersSchema,
  AuthSessionResponseSchema,
  type ForgotPasswordInput,
  GenericMessageResponseSchema,
  PasskeyAuthOptionsEnvelopeSchema,
  type ResendEmailOtpInput,
  type ResetPasswordOtpInput,
  SessionBootstrapResponseSchema,
  type VerifyEmailOtpInput,
} from '@pokeverse/shared';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { Observable, catchError, firstValueFrom, map, of } from 'rxjs';
import { extractApiErrorMessage } from '../http/api-error.util';

export type GenericMessageOutcome =
  | ReturnType<typeof GenericMessageResponseSchema.safeParse>
  | { readonly httpError: unknown };

export type SessionResponseOutcome =
  | ReturnType<typeof AuthSessionResponseSchema.safeParse>
  | { readonly httpError: unknown };

function isPasskeyRequestOptions(value: unknown): value is PublicKeyCredentialRequestOptionsJSON {
  return typeof value === 'object' && value !== null && 'challenge' in value;
}

@Injectable({ providedIn: 'root' })
export class AuthRecoveryService {
  private readonly http = inject(HttpClient);

  fetchSessionBootstrap() {
    return this.http.get<unknown>('/api/v1/auth/session').pipe(
      map((raw) => SessionBootstrapResponseSchema.safeParse(raw)),
      catchError(() => of(null)),
    );
  }

  fetchProviders() {
    return this.http.get<unknown>('/api/v1/auth/providers').pipe(
      map((raw) => AuthProvidersSchema.safeParse(raw)),
      catchError(() => of(null)),
    );
  }

  postSession(url: string, payload: unknown): Observable<SessionResponseOutcome> {
    return this.http.post<unknown>(url, payload).pipe(
      map((raw) => AuthSessionResponseSchema.safeParse(raw)),
      catchError((err: unknown) => of({ httpError: err } as const)),
    );
  }

  async postRefreshToken() {
    try {
      const raw = await firstValueFrom(this.http.post<unknown>('/api/v1/auth/refresh', null));
      return AuthSessionResponseSchema.safeParse(raw);
    } catch {
      return null;
    }
  }

  postLogout(): Observable<void | undefined> {
    return this.http.post<void>('/api/v1/auth/logout', null).pipe(catchError(() => of(undefined)));
  }

  verifyEmailOtp(input: VerifyEmailOtpInput): Observable<GenericMessageOutcome> {
    return this.postGenericMessage('/api/v1/auth/verify-email', input);
  }

  resendVerificationOtp(input: ResendEmailOtpInput): Observable<GenericMessageOutcome> {
    return this.postGenericMessage('/api/v1/auth/resend-verification', input);
  }

  requestPasswordReset(input: ForgotPasswordInput): Observable<GenericMessageOutcome> {
    return this.postGenericMessage('/api/v1/auth/forgot-password', input);
  }

  resetPasswordWithOtp(input: ResetPasswordOtpInput): Observable<GenericMessageOutcome> {
    return this.postGenericMessage('/api/v1/auth/reset-password', input);
  }

  async authenticateWithPasskey(
    email?: string,
  ): Promise<SessionResponseOutcome | { readonly customError: string }> {
    try {
      const rawOptions = await firstValueFrom(
        this.http.post<unknown>('/api/v1/auth/passkeys/login/options', email ? { email } : {}),
      );
      const parsedOptions = PasskeyAuthOptionsEnvelopeSchema.safeParse(rawOptions);
      if (!parsedOptions.success || !isPasskeyRequestOptions(parsedOptions.data.options)) {
        return { customError: 'Desafio Passkey inválido.' };
      }

      const { startAuthentication } = await import('@simplewebauthn/browser');
      const assertion = await startAuthentication({ optionsJSON: parsedOptions.data.options });

      const rawSession = await firstValueFrom(
        this.http.post<unknown>('/api/v1/auth/passkeys/login/verify', {
          challengeToken: parsedOptions.data.challengeToken,
          response: assertion,
        }),
      );
      return AuthSessionResponseSchema.safeParse(rawSession);
    } catch (error) {
      let message = 'Falha ao autenticar via Passkey.';
      if (error instanceof HttpErrorResponse) {
        message = extractApiErrorMessage(error, message);
      } else if (error instanceof Error && error.name === 'NotAllowedError') {
        message = 'Autenticação com Passkey cancelada no dispositivo.';
      }
      return { customError: message };
    }
  }

  private postGenericMessage(url: string, payload: unknown): Observable<GenericMessageOutcome> {
    return this.http.post<unknown>(url, payload).pipe(
      map((raw) => GenericMessageResponseSchema.safeParse(raw)),
      catchError((err: unknown) => of({ httpError: err } as const)),
    );
  }
}
