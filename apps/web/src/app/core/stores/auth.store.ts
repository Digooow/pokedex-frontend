import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type {
  AccessMode,
  AuthSessionResponse,
  ForgotPasswordInput,
  LoginTrainerInput,
  MfaChallengeVerifyInput,
  MfaMethod,
  RegisterTrainerInput,
  ResendEmailOtpInput,
  ResetPasswordOtpInput,
  SessionAuthState,
  TrainerProfile,
  VerifyEmailOtpInput,
} from '@pokeverse/shared';
import { Observable, finalize, shareReplay } from 'rxjs';
import { extractApiErrorMessage } from '../http/api-error.util';
import { AuthCrossTabSyncService } from './auth-cross-tab-sync.service';
import {
  AuthRecoveryService,
  type GenericMessageOutcome,
  type SessionResponseOutcome,
} from './auth-recovery.service';

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

const DEFAULT_AUTH_ERROR = 'Não foi possível autenticar. Confira os dados e tente novamente.';

@Injectable({ providedIn: 'root' })
export class AuthStore implements OnDestroy {
  private readonly router = inject(Router);
  private readonly recovery = inject(AuthRecoveryService);
  private readonly crossTabSync = inject(AuthCrossTabSyncService);

  private readonly sessionSignal = signal<AuthSessionResponse | null>(null);
  private readonly visitorPromptSignal = signal<VisitorPromptContext | null>(null);
  private readonly securityModalOpenSignal = signal(false);
  private readonly pendingSecurityFeedbackSignal = signal<{
    readonly tone: 'ok' | 'error';
    readonly text: string;
  } | null>(null);
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

  constructor() {
    this.crossTabSync.connect((msg) => {
      if (msg.type === 'logout') {
        this.sessionSignal.set(null);
        this.visitorPromptSignal.set(null);
        this.securityModalOpenSignal.set(false);
        return;
      }
      this.sessionSignal.set(msg.session);
    });
  }

  restoreSession(): void {
    const oauthReturn = this.crossTabSync.consumeOAuthCallbackParams();
    this.loadProviders();
    this.recovery.fetchSessionBootstrap().subscribe((parsed) => {
      if (!parsed?.success) {
        this.sessionSignal.set(null);
        if (oauthReturn.authError) this.openGoogleAuthErrorPrompt(oauthReturn.authError);
        return;
      }
      if (parsed.data.authenticated) {
        this.sessionSignal.set(parsed.data);
        this.handleAuthenticatedOAuthReturn(parsed.data.sessionState, oauthReturn);
        return;
      }
      this.sessionSignal.set(null);
      if (parsed.data.canRefresh) this.refreshSession().subscribe();
      if (oauthReturn.authError) this.openGoogleAuthErrorPrompt(oauthReturn.authError);
    });
  }

  consumeSecurityFeedback(): { readonly tone: 'ok' | 'error'; readonly text: string } | null {
    const current = this.pendingSecurityFeedbackSignal();
    this.pendingSecurityFeedbackSignal.set(null);
    return current;
  }

  loadProviders(): void {
    this.recovery.fetchProviders().subscribe((parsed) => {
      if (parsed?.success) this.providersSignal.set(parsed.data);
    });
  }

  login = (input: LoginTrainerInput) => this.submitSessionPost('/api/v1/auth/login', input);
  register = (input: RegisterTrainerInput) => this.submitSessionPost('/api/v1/auth/register', input);
  verifyMfaChallenge = (input: MfaChallengeVerifyInput) =>
    this.submitSessionPost('/api/v1/auth/mfa/verify', input);

  async loginWithPasskey(email?: string): Promise<void> {
    if (this.mutationSignal().status === 'submitting') return;
    this.mutationSignal.set({ status: 'submitting' });
    const outcome = await this.recovery.authenticateWithPasskey(email);
    if ('customError' in outcome) {
      this.mutationSignal.set({ status: 'error', message: outcome.customError });
      return;
    }
    this.handleSessionOutcome(outcome);
  }

  signInWithGoogle(): void {
    globalThis.location.assign('/api/v1/auth/google/start');
  }

  verifyEmailOtp(input: VerifyEmailOtpInput): void {
    if (this.mutationSignal().status === 'submitting') return;
    this.mutationSignal.set({ status: 'submitting' });
    const targetRoute = this.visitorPromptSignal()?.targetRoute;

    this.recovery.verifyEmailOtp(input).subscribe((outcome) => {
      if ('httpError' in outcome || !outcome.success) {
        this.mutationSignal.set({
          status: 'error',
          message:
            'httpError' in outcome
              ? extractApiErrorMessage(outcome.httpError, DEFAULT_AUTH_ERROR)
              : 'Resposta inválida do servidor.',
        });
        return;
      }
      const current = this.sessionSignal();
      if (current?.trainer.email.toLowerCase() === input.email.trim().toLowerCase()) {
        this.sessionSignal.set({
          ...current,
          trainer: { ...current.trainer, emailVerifiedAt: new Date().toISOString() },
        });
      }
      this.mutationSignal.set({ status: 'idle' });
      this.visitorPromptSignal.set(null);
      if (targetRoute) void this.router.navigateByUrl(targetRoute);
    });
  }

  resendVerificationOtp(input: ResendEmailOtpInput): void {
    this.runMessageMutation(this.recovery.resendVerificationOtp(input));
  }

  requestPasswordReset(input: ForgotPasswordInput): void {
    this.runMessageMutation(this.recovery.requestPasswordReset(input));
  }

  resetPasswordWithOtp(input: ResetPasswordOtpInput): void {
    this.runMessageMutation(this.recovery.resetPasswordWithOtp(input), () => {
      this.sessionSignal.set(null);
      this.crossTabSync.broadcast({ type: 'logout' });
    });
  }

  refreshSession(): Observable<boolean> {
    if (this.inflightRefresh$) return this.inflightRefresh$;

    this.inflightRefresh$ = new Observable<boolean>((subscriber) => {
      this.crossTabSync
        .runWithRefreshLock(() => this.executeRefresh())
        .then((ok) => {
          subscriber.next(ok);
          subscriber.complete();
        })
        .catch(() => {
          subscriber.next(false);
          subscriber.complete();
        });
    }).pipe(
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
    this.crossTabSync.broadcast({ type: 'logout' });
    this.recovery.postLogout().subscribe(() => this.sessionSignal.set(null));
  }

  ngOnDestroy(): void {
    this.crossTabSync.ngOnDestroy();
  }

  openMfaChallengePrompt(): void {
    this.requestTrainerAccess(
      'Verificação em 2 Etapas (2FA)',
      'Sua sessão está em estado MFA_PENDING. Confirme com seu Authenticator App, código de backup ou Passkey.',
      this.visitorPromptSignal()?.targetRoute,
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

  openSecuritySettings = () => this.securityModalOpenSignal.set(true);
  closeSecuritySettings = () => this.securityModalOpenSignal.set(false);

  clearMutationFeedback(): void {
    const status = this.mutationSignal().status;
    if (status === 'error' || status === 'success') this.mutationSignal.set({ status: 'idle' });
  }

  private submitSessionPost(url: string, body: unknown): void {
    if (this.mutationSignal().status === 'submitting') return;
    this.mutationSignal.set({ status: 'submitting' });
    this.recovery.postSession(url, body).subscribe((outcome) => this.handleSessionOutcome(outcome));
  }

  private runMessageMutation(
    obs: Observable<GenericMessageOutcome>,
    onSuccess?: () => void,
  ): void {
    if (this.mutationSignal().status === 'submitting') return;
    this.mutationSignal.set({ status: 'submitting' });
    obs.subscribe((outcome) => {
      if ('httpError' in outcome) {
        this.mutationSignal.set({
          status: 'error',
          message: extractApiErrorMessage(outcome.httpError, DEFAULT_AUTH_ERROR),
        });
        return;
      }
      if (!outcome.success) {
        this.mutationSignal.set({ status: 'error', message: 'Resposta inválida do servidor.' });
        return;
      }
      this.mutationSignal.set({ status: 'success', message: outcome.data.message });
      onSuccess?.();
    });
  }

  private handleAuthenticatedOAuthReturn(
    sessionState: SessionAuthState,
    oauthReturn: { readonly googleLinked: boolean; readonly authError: string | null },
  ): void {
    if (sessionState === 'MFA_PENDING') {
      this.openMfaChallengePrompt();
    } else if (oauthReturn.googleLinked || oauthReturn.authError) {
      this.pendingSecurityFeedbackSignal.set(
        oauthReturn.googleLinked
          ? { tone: 'ok', text: 'Conta Google vinculada com sucesso via OAuth 2.0 PKCE.' }
          : { tone: 'error', text: this.crossTabSync.mapOAuthErrorCode(oauthReturn.authError ?? '') },
      );
      this.openSecuritySettings();
    }
  }

  private handleSessionOutcome(outcome: SessionResponseOutcome): void {
    if ('httpError' in outcome || !outcome.success) {
      this.mutationSignal.set({
        status: 'error',
        message:
          'httpError' in outcome
            ? extractApiErrorMessage(outcome.httpError, DEFAULT_AUTH_ERROR)
            : 'Resposta de sessão inválida recebida do servidor.',
      });
      return;
    }

    const targetRoute = this.visitorPromptSignal()?.targetRoute;
    this.sessionSignal.set(outcome.data);
    this.crossTabSync.broadcast({ type: 'session', session: outcome.data });
    this.mutationSignal.set({ status: 'idle' });
    if (outcome.data.sessionState === 'MFA_PENDING') {
      this.openMfaChallengePrompt();
      return;
    }
    this.visitorPromptSignal.set(null);
    if (targetRoute) void this.router.navigateByUrl(targetRoute);
  }

  private openGoogleAuthErrorPrompt(errorCode: string): void {
    this.requestTrainerAccess(
      'Entrar com Google',
      'Não foi possível concluir o login OIDC com sua conta Google.',
      undefined,
      'login',
    );
    this.mutationSignal.set({
      status: 'error',
      message: this.crossTabSync.mapOAuthErrorCode(errorCode),
    });
  }

  private async executeRefresh(): Promise<boolean> {
    const parsed = await this.recovery.postRefreshToken();
    if (!parsed?.success) {
      this.sessionSignal.set(null);
      this.crossTabSync.broadcast({ type: 'logout' });
      return false;
    }
    this.sessionSignal.set(parsed.data);
    this.crossTabSync.broadcast({ type: 'session', session: parsed.data });
    return true;
  }
}

export { AuthStore as AuthSessionStore };
