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
import type { Observable } from 'rxjs';
import {
  AuthCrossTabSyncService,
  type OAuthCallbackParams,
  type SecurityFeedbackBanner,
} from './auth-cross-tab-sync.service';
import {
  type AuthDialogMode,
  type AuthMutationState,
  AuthRecoveryService,
  type GenericMessageOutcome,
  type SessionResponseOutcome,
  type VisitorPromptContext,
  resolveAuthOutcomeError,
} from './auth-recovery.service';

export type { AuthDialogMode, AuthMutationState, VisitorPromptContext };

@Injectable({ providedIn: 'root' })
export class AuthStore implements OnDestroy {
  private readonly router = inject(Router);
  private readonly recovery = inject(AuthRecoveryService);
  private readonly crossTabSync = inject(AuthCrossTabSyncService);

  private readonly sessionSignal = signal<AuthSessionResponse | null>(null);
  private readonly visitorPromptSignal = signal<VisitorPromptContext | null>(null);
  private readonly securityModalOpenSignal = signal(false);
  private readonly pendingSecurityFeedbackSignal = signal<SecurityFeedbackBanner | null>(null);
  private readonly mutationSignal = signal<AuthMutationState>({ status: 'idle' });
  private readonly providersSignal = signal<{ googleEnabled: boolean; webauthnEnabled: boolean }>({
    googleEnabled: false,
    webauthnEnabled: true,
  });

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
        this.clearLocalSessionState();
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

  consumeSecurityFeedback(): SecurityFeedbackBanner | null {
    const current = this.pendingSecurityFeedbackSignal();
    this.pendingSecurityFeedbackSignal.set(null);
    return current;
  }

  loadProviders = () =>
    this.recovery.fetchProviders().subscribe((parsed) => {
      if (parsed?.success) this.providersSignal.set(parsed.data);
    });

  login = (input: LoginTrainerInput) => this.submitSessionPost('/api/v1/auth/login', input);
  register = (input: RegisterTrainerInput) =>
    this.submitSessionPost('/api/v1/auth/register', input);
  verifyMfaChallenge = (input: MfaChallengeVerifyInput) =>
    this.submitSessionPost('/api/v1/auth/mfa/verify', input);

  async loginWithPasskey(email?: string): Promise<void> {
    if (!this.beginSubmitting()) return;
    const outcome = await this.recovery.authenticateWithPasskey(email);
    if ('customError' in outcome) {
      this.setMutationError(outcome.customError);
      return;
    }
    this.handleSessionOutcome(outcome);
  }

  signInWithGoogle = () => globalThis.location.assign('/api/v1/auth/google/start');

  verifyEmailOtp(input: VerifyEmailOtpInput): void {
    if (!this.beginSubmitting()) return;
    const targetRoute = this.visitorPromptSignal()?.targetRoute;

    this.recovery.verifyEmailOtp(input).subscribe((outcome) => {
      const errorMsg = resolveAuthOutcomeError(outcome, 'Resposta inválida do servidor.');
      if (errorMsg) {
        this.setMutationError(errorMsg);
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

  resendVerificationOtp = (input: ResendEmailOtpInput) =>
    this.runMessageMutation(this.recovery.resendVerificationOtp(input));

  requestPasswordReset = (input: ForgotPasswordInput) =>
    this.runMessageMutation(this.recovery.requestPasswordReset(input));

  resetPasswordWithOtp = (input: ResetPasswordOtpInput) =>
    this.runMessageMutation(this.recovery.resetPasswordWithOtp(input), () => {
      this.sessionSignal.set(null);
      this.crossTabSync.broadcast({ type: 'logout' });
    });

  refreshSession = (): Observable<boolean> =>
    this.crossTabSync.createSingleflightRefresh(() => this.executeRefresh());

  logout(): void {
    this.clearLocalSessionState();
    this.mutationSignal.set({ status: 'idle' });
    this.crossTabSync.broadcast({ type: 'logout' });
    this.recovery.postLogout().subscribe(() => this.sessionSignal.set(null));
  }

  ngOnDestroy = () => this.crossTabSync.ngOnDestroy();

  openMfaChallengePrompt = () =>
    this.requestTrainerAccess(
      'Verificação em 2 Etapas (2FA)',
      'Sua sessão está em estado MFA_PENDING. Confirme com seu Authenticator App, código de backup ou Passkey.',
      this.visitorPromptSignal()?.targetRoute,
      'mfa-challenge',
    );

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

  private beginSubmitting(): boolean {
    if (this.mutationSignal().status === 'submitting') return false;
    this.mutationSignal.set({ status: 'submitting' });
    return true;
  }

  private setMutationError = (message: string) =>
    this.mutationSignal.set({ status: 'error', message });

  private clearLocalSessionState(): void {
    this.sessionSignal.set(null);
    this.visitorPromptSignal.set(null);
    this.securityModalOpenSignal.set(false);
  }

  private submitSessionPost(url: string, body: unknown): void {
    if (!this.beginSubmitting()) return;
    this.recovery.postSession(url, body).subscribe((outcome) => this.handleSessionOutcome(outcome));
  }

  private runMessageMutation(obs: Observable<GenericMessageOutcome>, onSuccess?: () => void): void {
    if (!this.beginSubmitting()) return;
    obs.subscribe((outcome) => {
      const errorMsg = resolveAuthOutcomeError(outcome, 'Resposta inválida do servidor.');
      if (errorMsg || 'httpError' in outcome || !outcome.success) {
        this.setMutationError(errorMsg ?? 'Resposta inválida do servidor.');
        return;
      }
      this.mutationSignal.set({ status: 'success', message: outcome.data.message });
      onSuccess?.();
    });
  }

  private handleAuthenticatedOAuthReturn(
    sessionState: SessionAuthState,
    oauthReturn: OAuthCallbackParams,
  ): void {
    if (sessionState === 'MFA_PENDING') {
      this.openMfaChallengePrompt();
      return;
    }
    const feedback = this.crossTabSync.resolveAuthenticatedOAuthFeedback(oauthReturn);
    if (feedback) {
      this.pendingSecurityFeedbackSignal.set(feedback);
      this.openSecuritySettings();
    }
  }

  private handleSessionOutcome(outcome: SessionResponseOutcome): void {
    const errorMsg = resolveAuthOutcomeError(
      outcome,
      'Resposta de sessão inválida recebida do servidor.',
    );
    if (errorMsg || 'httpError' in outcome || !outcome.success) {
      this.setMutationError(errorMsg ?? 'Resposta de sessão inválida recebida do servidor.');
      return;
    }

    const targetRoute = this.visitorPromptSignal()?.targetRoute;
    this.applySessionAndBroadcast(outcome.data);
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
    this.setMutationError(this.crossTabSync.mapOAuthErrorCode(errorCode));
  }

  private async executeRefresh(): Promise<boolean> {
    const parsed = await this.recovery.postRefreshToken();
    if (!parsed?.success) {
      this.sessionSignal.set(null);
      this.crossTabSync.broadcast({ type: 'logout' });
      return false;
    }
    this.applySessionAndBroadcast(parsed.data);
    return true;
  }

  private applySessionAndBroadcast(session: AuthSessionResponse): void {
    this.sessionSignal.set(session);
    this.crossTabSync.broadcast({ type: 'session', session });
  }
}

export { AuthStore as AuthSessionStore };
