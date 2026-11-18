import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  type AccessMode,
  type AuthSessionResponse,
  AuthSessionResponseSchema,
  type ForgotPasswordInput,
  GenericMessageResponseSchema,
  type LoginTrainerInput,
  type RegisterTrainerInput,
  type ResendEmailOtpInput,
  type ResetPasswordOtpInput,
  type SessionAuthState,
  SessionBootstrapResponseSchema,
  type TrainerProfile,
  type VerifyEmailOtpInput,
} from '@pokeverse/shared';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';

export type AuthDialogMode = 'login' | 'register' | 'forgot' | 'verify-email';

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

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);

  private readonly sessionSignal = signal<AuthSessionResponse | null>(null);
  private readonly visitorPromptSignal = signal<VisitorPromptContext | null>(null);
  private readonly mutationSignal = signal<AuthMutationState>({ status: 'idle' });
  private inflightRefresh$: Observable<boolean> | null = null;

  readonly trainer = computed<TrainerProfile | null>(() => this.sessionSignal()?.trainer ?? null);
  readonly sessionState = computed<SessionAuthState | null>(
    () => this.sessionSignal()?.sessionState ?? null,
  );
  readonly isMfaPending = computed(() => this.sessionState() === 'MFA_PENDING');
  readonly isAuthenticated = computed(() => this.sessionState() === 'AUTHENTICATED');
  readonly accessMode = computed<AccessMode>(() =>
    this.isAuthenticated() ? 'trainer' : 'visitor',
  );
  readonly visitorPrompt = this.visitorPromptSignal.asReadonly();
  readonly mutationState = this.mutationSignal.asReadonly();

  restoreSession(): void {
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
          return;
        }
        this.sessionSignal.set(null);
        if (parsed.data.canRefresh) {
          this.refreshSession().subscribe();
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
    this.http
      .post<void>('/api/v1/auth/logout', null)
      .pipe(
        tap(() => this.sessionSignal.set(null)),
        catchError(() => of(undefined)),
      )
      .subscribe();
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

    this.sessionSignal.set(outcome.data);
    this.mutationSignal.set({ status: 'idle' });
    if (outcome.data.sessionState === 'AUTHENTICATED') {
      this.visitorPromptSignal.set(null);
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
