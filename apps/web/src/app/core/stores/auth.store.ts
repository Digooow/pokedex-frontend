import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  type AccessMode,
  type AuthSessionResponse,
  AuthSessionResponseSchema,
  type LoginTrainerInput,
  type RegisterTrainerInput,
  type TrainerProfile,
} from '@pokeverse/shared';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';

export interface VisitorPromptContext {
  readonly title: string;
  readonly description: string;
  readonly targetRoute?: string;
}

export type AuthMutationState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'error'; readonly message: string };

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);

  private readonly sessionSignal = signal<AuthSessionResponse | null>(null);
  private readonly visitorPromptSignal = signal<VisitorPromptContext | null>(null);
  private readonly mutationSignal = signal<AuthMutationState>({ status: 'idle' });
  private inflightRefresh$: Observable<string | null> | null = null;

  readonly trainer = computed<TrainerProfile | null>(() => this.sessionSignal()?.trainer ?? null);
  readonly accessToken = computed<string | null>(() => this.sessionSignal()?.accessToken ?? null);
  readonly isAuthenticated = computed(() => this.accessToken() !== null);
  readonly accessMode = computed<AccessMode>(() =>
    this.isAuthenticated() ? 'trainer' : 'visitor',
  );
  readonly visitorPrompt = this.visitorPromptSignal.asReadonly();
  readonly mutationState = this.mutationSignal.asReadonly();

  restoreSession(): void {
    this.refreshAccessToken().subscribe();
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

  refreshAccessToken(): Observable<string | null> {
    if (this.inflightRefresh$) {
      return this.inflightRefresh$;
    }

    this.inflightRefresh$ = this.http.post<unknown>('/api/v1/auth/refresh', null).pipe(
      map((raw) => {
        const parsed = AuthSessionResponseSchema.safeParse(raw);
        if (!parsed.success) {
          this.sessionSignal.set(null);
          return null;
        }
        this.sessionSignal.set(parsed.data);
        return parsed.data.accessToken;
      }),
      catchError(() => {
        this.sessionSignal.set(null);
        return of(null);
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

  requestTrainerAccess(title: string, description: string, targetRoute?: string): void {
    this.mutationSignal.set({ status: 'idle' });
    this.visitorPromptSignal.set({ title, description, targetRoute });
  }

  dismissVisitorPrompt(): void {
    this.mutationSignal.set({ status: 'idle' });
    this.visitorPromptSignal.set(null);
  }

  clearMutationError(): void {
    if (this.mutationSignal().status === 'error') {
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
    this.visitorPromptSignal.set(null);
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
