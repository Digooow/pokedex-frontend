import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  type AccessMode,
  AuthProvidersSchema,
  type AuthSessionResponse,
  AuthSessionResponseSchema,
  type ForgotPasswordInput,
  GenericMessageResponseSchema,
  type LoginTrainerInput,
  type MfaChallengeVerifyInput,
  type MfaMethod,
  PasskeyAuthOptionsEnvelopeSchema,
  type RegisterTrainerInput,
  type ResendEmailOtpInput,
  type ResetPasswordOtpInput,
  type SessionAuthState,
  SessionBootstrapResponseSchema,
  type TrainerProfile,
  type VerifyEmailOtpInput,
} from '@pokeverse/shared';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { Observable, catchError, firstValueFrom, finalize, map, of, shareReplay, tap } from 'rxjs';

export type AuthDialogMode = 'login' | 'register' | 'forgot' | 'verify-email' | 'mfa-challenge';

export interface VisitorPromptContext {
  readonly title: string;
  readonly description: string;
  readonly targetRoute?: string;
  readonly initialMode?: AuthDialogMode;
}

export type AuthMutationState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly message: string }
  | { readonly status: 'error'; readonly message: string };

function isPasskeyRequestOptions(value: unknown): value is PublicKeyCredentialRequestOptionsJSON {
  return typeof value === 'object' && value !== null && 'challenge' in value;
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly sessionSignal = signal<AuthSessionResponse | null>(null);
  private readonly visitorPromptSignal = signal<VisitorPromptContext | null>(null);
  private readonly securityModalOpenSignal = signal(false);
  private readonly mutationSignal = signal<AuthMutationState>({ status: 'idle' });
  private readonly providersSignal = signal<{ googleEnabled: boolean; webauthnEnabled: boolean }>({
    googleEnabled: false,
    webauthnEnabled: true,
  });
  private inflightRefresh$: Observable<boolean> | null = null;

  readonly trainer = computed<TrainerProfile | null>(() => this.sessionSignal()?.trainer ?? null);
  readonly sessionState = computed<SessionAuthState | null>(
    () => this.sessionSignal()?.sessionState ?? null,
  );
  readonly mfaMethods = computed<readonly MfaMethod[]>(
    () => this.sessionSignal()?.mfaMethods ?? [],
  );
  readonly isMfaPending = computed(() => this.sessionState() === 'MFA_PENDING');
  readonly isAuthenticated = computed(() => this.sessionState() === 'AUTHENTICATED');
  readonly accessMode = computed<AccessMode>(() =>
    this.isAuthenticated() ? 'trainer' : 'visitor',
  );
  readonly visitorPrompt = this.visitorPromptSignal.asReadonly();
  readonly securityModalOpen = this.securityModalOpenSignal.asReadonly();
  readonly mutationState = this.mutationSignal.asReadonly();
  readonly providers = this.providersSignal.asReadonly();

  restoreSession(): void {
    this.loadProviders();
    this.http
      .get<unknown>('/api/v1/auth/session')
      .pipe(
        map((raw) => SessionBootstrapResponseSchema.safeParse(raw)),
        catchError(() => of(null)),
      )
      .subscribe((parsed) => {
        if (!parsed?.success) {
          this.sessionSignal.set(null);
          return;
        }
        if (parsed.data.authenticated) {
          this.sessionSignal.set(parsed.data);
          if (parsed.data.sessionState === 'MFA_PENDING') {
            this.openMfaChallengePrompt();
          }
          return;
        }
        this.sessionSignal.set(null);
        if (parsed.data.canRefresh) {
          this.refreshSession().subscribe();
        }
      });
  }

  loadProviders(): void {
    this.http
      .get<unknown>('/api/v1/auth/providers')
      .pipe(
        map((raw) => AuthProvidersSchema.safeParse(raw)),
        catchError(() => of(null)),
      )
      .subscribe((parsed) => {
        if (parsed?.success) {
          this.providersSignal.set(parsed.data);
        }
      });
  }

  login(input: LoginTrainerInput): void {
    if (this.mutationSignal().status === 'submitting') {
      return;
    }
    this.mutationSignal.set({ status: 'submitting' });

    this.http
      .post<unknown>('/api/v1/auth/login', input)
      .pipe(
        map((raw) => AuthSessionResponseSchema.safeParse(raw)),
        catchError((err: unknown) => of({ httpError: err } as const)),
      )
      .subscribe((outcome) => this.handleSessionOutcome(outcome));
  }

  register(input: RegisterTrainerInput): void {
    if (this.mutationSignal().status === 'submitting') {
      return;
    }
    this.mutationSignal.set({ status: 'submitting' });

    this.http
      .post<unknown>('/api/v1/auth/register', input)
      .pipe(
        map((raw) => AuthSessionResponseSchema.safeParse(raw)),
        catchError((err: unknown) => of({ httpError: err } as const)),
      )
      .subscribe((outcome) => this.handleSessionOutcome(outcome));
  }

  verifyMfaChallenge(input: MfaChallengeVerifyInput): void {
    if (this.mutationSignal().status === 'submitting') {
      return;
    }
    this.mutationSignal.set({ status: 'submitting' });

    this.http
      .post<unknown>('/api/v1/auth/mfa/verify', input)
      .pipe(
        map((raw) => AuthSessionResponseSchema.safeParse(raw)),
        catchError((err: unknown) => of({ httpError: err } as const)),
      )
      .subscribe((outcome) => this.handleSessionOutcome(outcome));
  }

  async loginWithPasskey(email?: string): Promise<void> {
    if (this.mutationSignal().status === 'submitting') {
      return;
    }
    this.mutationSignal.set({ status: 'submitting' });

    try {
      const rawOptions = await firstValueFrom(
        this.http.post<unknown>('/api/v1/auth/passkeys/login/options', email ? { email } : {}),
      );
      const parsedOptions = PasskeyAuthOptionsEnvelopeSchema.safeParse(rawOptions);
      if (!parsedOptions.success || !isPasskeyRequestOptions(parsedOptions.data.options)) {
        this.mutationSignal.set({ status: 'error', message: 'Desafio Passkey inválido.' });
        return;
      }

      const { startAuthentication } = await import('@simplewebauthn/browser');
      const assertion = await startAuthentication({ optionsJSON: parsedOptions.data.options });

      const rawSession = await firstValueFrom(
        this.http.post<unknown>('/api/v1/auth/passkeys/login/verify', {
          challengeToken: parsedOptions.data.challengeToken,
          response: assertion,
        }),
      );
      this.handleSessionOutcome(AuthSessionResponseSchema.safeParse(rawSession));
    } catch (error) {
      let message = 'Falha ao autenticar via Passkey.';
      if (error instanceof HttpErrorResponse) {
        message = this.extractErrorMessage(error);
      } else if (error instanceof Error && error.name === 'NotAllowedError') {
        message = 'Autenticação com Passkey cancelada no dispositivo.';
      }
      this.mutationSignal.set({ status: 'error', message });
    }
  }

  signInWithGoogle(): void {
    globalThis.location.assign('/api/v1/auth/google/start');
  }

  verifyEmailOtp(input: VerifyEmailOtpInput): void {
    if (this.mutationSignal().status === 'submitting') {
      return;
    }
    this.mutationSignal.set({ status: 'submitting' });

    this.http
      .post<unknown>('/api/v1/auth/verify-email', input)
      .pipe(
        map((raw) => GenericMessageResponseSchema.safeParse(raw)),
        catchError((err: unknown) => of({ httpError: err } as const)),
      )
      .subscribe((outcome) => {
        if ('httpError' in outcome) {
          this.mutationSignal.set({
            status: 'error',
            message: this.extractErrorMessage(outcome.httpError),
          });
          return;
        }
        if (!outcome.success) {
          this.mutationSignal.set({ status: 'error', message: 'Resposta inválida do servidor.' });
          return;
        }
        const current = this.sessionSignal();
        if (current && current.trainer.email === input.email) {
          this.sessionSignal.set({
            ...current,
            trainer: {
              ...current.trainer,
              emailVerifiedAt: new Date().toISOString(),
            },
          });
        }
        this.mutationSignal.set({ status: 'success', message: outcome.data.message });
      });
  }

  resendVerificationOtp(input: ResendEmailOtpInput): void {
    if (this.mutationSignal().status === 'submitting') {
      return;
    }
    this.mutationSignal.set({ status: 'submitting' });

    this.http
      .post<unknown>('/api/v1/auth/resend-verification', input)
      .pipe(
        map((raw) => GenericMessageResponseSchema.safeParse(raw)),
        catchError((err: unknown) => of({ httpError: err } as const)),
      )
      .subscribe((outcome) => this.handleMessageOutcome(outcome));
  }

  requestPasswordReset(input: ForgotPasswordInput): void {
    if (this.mutationSignal().status === 'submitting') {
      return;
    }
    this.mutationSignal.set({ status: 'submitting' });

    this.http
      .post<unknown>('/api/v1/auth/forgot-password', input)
      .pipe(
        map((raw) => GenericMessageResponseSchema.safeParse(raw)),
        catchError((err: unknown) => of({ httpError: err } as const)),
      )
      .subscribe((outcome) => this.handleMessageOutcome(outcome));
  }

  resetPasswordWithOtp(input: ResetPasswordOtpInput): void {
    if (this.mutationSignal().status === 'submitting') {
      return;
    }
    this.mutationSignal.set({ status: 'submitting' });

    this.http
      .post<unknown>('/api/v1/auth/reset-password', input)
      .pipe(
        map((raw) => GenericMessageResponseSchema.safeParse(raw)),
        catchError((err: unknown) => of({ httpError: err } as const)),
      )
      .subscribe((outcome) => {
        this.handleMessageOutcome(outcome);
        if (!('httpError' in outcome) && outcome.success) {
          this.sessionSignal.set(null);
        }
      });
  }

  refreshSession(): Observable<boolean> {
    if (this.inflightRefresh$) {
      return this.inflightRefresh$;
    }

    this.inflightRefresh$ = this.http.post<unknown>('/api/v1/auth/refresh', null).pipe(
      map((raw) => {
        const parsed = AuthSessionResponseSchema.safeParse(raw);
        if (!parsed.success) {
          this.sessionSignal.set(null);
          return false;
        }
        this.sessionSignal.set(parsed.data);
        return true;
      }),
      catchError(() => {
        this.sessionSignal.set(null);
        return of(false);
      }),
      finalize(() => {
        this.inflightRefresh$ = null;
      }),
      shareReplay(1),
    );

    return this.inflightRefresh$;
  }

  logout(): void {
    this.sessionSignal.set(null);
    this.mutationSignal.set({ status: 'idle' });
    this.visitorPromptSignal.set(null);
    this.securityModalOpenSignal.set(false);
    this.http
      .post<void>('/api/v1/auth/logout', null)
      .pipe(
        tap(() => this.sessionSignal.set(null)),
        catchError(() => of(undefined)),
      )
      .subscribe();
  }

  openMfaChallengePrompt(): void {
    const preservedTarget = this.visitorPromptSignal()?.targetRoute;
    this.requestTrainerAccess(
      'Verificação em 2 Etapas (2FA)',
      'Sua sessão está em estado MFA_PENDING. Confirme com seu Authenticator App, código de backup ou Passkey.',
      preservedTarget,
      'mfa-challenge',
    );
  }

  requestTrainerAccess(
    title: string,
    description: string,
    targetRoute?: string,
    initialMode?: AuthDialogMode,
  ): void {
    this.mutationSignal.set({ status: 'idle' });
    this.visitorPromptSignal.set({ title, description, targetRoute, initialMode });
  }

  dismissVisitorPrompt(): void {
    this.mutationSignal.set({ status: 'idle' });
    this.visitorPromptSignal.set(null);
  }

  openSecuritySettings(): void {
    this.securityModalOpenSignal.set(true);
  }

  closeSecuritySettings(): void {
    this.securityModalOpenSignal.set(false);
  }

  clearMutationFeedback(): void {
    const status = this.mutationSignal().status;
    if (status === 'error' || status === 'success') {
      this.mutationSignal.set({ status: 'idle' });
    }
  }

  private handleSessionOutcome(
    outcome:
      | ReturnType<typeof AuthSessionResponseSchema.safeParse>
      | { readonly httpError: unknown },
  ): void {
    if ('httpError' in outcome) {
      this.mutationSignal.set({
        status: 'error',
        message: this.extractErrorMessage(outcome.httpError),
      });
      return;
    }

    if (!outcome.success) {
      this.mutationSignal.set({
        status: 'error',
        message: 'Resposta de sessão inválida recebida do servidor.',
      });
      return;
    }

    const targetRoute = this.visitorPromptSignal()?.targetRoute;
    this.sessionSignal.set(outcome.data);
    this.mutationSignal.set({ status: 'idle' });
    if (outcome.data.sessionState === 'MFA_PENDING') {
      this.openMfaChallengePrompt();
      return;
    }
    this.visitorPromptSignal.set(null);
    if (targetRoute) {
      void this.router.navigateByUrl(targetRoute);
    }
  }

  private handleMessageOutcome(
    outcome:
      | ReturnType<typeof GenericMessageResponseSchema.safeParse>
      | { readonly httpError: unknown },
  ): void {
    if ('httpError' in outcome) {
      this.mutationSignal.set({
        status: 'error',
        message: this.extractErrorMessage(outcome.httpError),
      });
      return;
    }
    if (!outcome.success) {
      this.mutationSignal.set({ status: 'error', message: 'Resposta inválida do servidor.' });
      return;
    }
    this.mutationSignal.set({ status: 'success', message: outcome.data.message });
  }

  private extractErrorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { message?: unknown } | null;
      if (body && typeof body.message === 'string' && body.message.trim()) {
        return body.message;
      }
      if (err.status === 0) {
        return 'API indisponível no momento. Verifique se o servidor NestJS está rodando.';
      }
    }
    return 'Não foi possível autenticar. Confira os dados e tente novamente.';
  }
}
