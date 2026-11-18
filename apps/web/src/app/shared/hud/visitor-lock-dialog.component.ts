import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  ForgotPasswordSchema,
  LoginTrainerSchema,
  MfaChallengeVerifySchema,
  RegisterTrainerSchema,
  ResendEmailOtpSchema,
  ResetPasswordOtpSchema,
  VerifyEmailOtpSchema,
} from '@pokeverse/shared';
import { type AuthDialogMode, AuthStore } from '../../core/stores/auth.store';

@Component({
  selector: 'pv-visitor-lock-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visitor-lock-dialog.component.html',
  styleUrl: './visitor-lock-dialog.component.scss',
})
export class VisitorLockDialogComponent {
  readonly auth = inject(AuthStore);
  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');
  private pressedOutside = false;

  readonly mode = signal<AuthDialogMode>('login');
  readonly username = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly otpCode = signal('');
  readonly useBackupCode = signal(false);
  readonly resetCodeRequested = signal(false);
  readonly localValidationError = signal<string | null>(null);

  readonly isSubmitting = computed(() => this.auth.mutationState().status === 'submitting');
  readonly activeErrorMessage = computed(() => {
    const local = this.localValidationError();
    if (local) {
      return local;
    }
    const serverState = this.auth.mutationState();
    return serverState.status === 'error' ? serverState.message : null;
  });
  readonly activeSuccessMessage = computed(() => {
    const serverState = this.auth.mutationState();
    return serverState.status === 'success' ? serverState.message : null;
  });

  constructor() {
    effect(() => {
      const prompt = this.auth.visitorPrompt();
      const dialog = this.dialogRef()?.nativeElement;
      if (!dialog) {
        return;
      }
      if (prompt) {
        this.localValidationError.set(null);
        this.mode.set(prompt.initialMode ?? 'login');
        const loggedTrainer = this.auth.trainer();
        if (loggedTrainer && !this.email()) {
          this.email.set(loggedTrainer.email);
        }
        if (!dialog.open && typeof dialog.showModal === 'function') {
          dialog.showModal();
        }
      } else if (dialog.open) {
        dialog.close();
      }
    });
  }

  switchMode(nextMode: AuthDialogMode): void {
    this.mode.set(nextMode);
    this.localValidationError.set(null);
    this.otpCode.set('');
    this.auth.clearMutationFeedback();
  }

  onInputChange(field: 'username' | 'email' | 'password' | 'otpCode', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.localValidationError.set(null);
    this.auth.clearMutationFeedback();

    switch (field) {
      case 'username':
        this.username.set(value);
        break;
      case 'email':
        this.email.set(value);
        break;
      case 'password':
        this.password.set(value);
        break;
      case 'otpCode':
        this.otpCode.set(value);
        break;
    }
  }

  onPasskeySignIn(): void {
    if (this.isSubmitting()) {
      return;
    }
    const rawEmail = this.email().trim().toLowerCase();
    void this.auth.loginWithPasskey(rawEmail || undefined);
  }

  onResendVerificationOtp(): void {
    if (this.isSubmitting()) {
      return;
    }
    const parsed = ResendEmailOtpSchema.safeParse({ email: this.email() });
    if (!parsed.success) {
      this.localValidationError.set(parsed.error.issues[0]?.message ?? 'E-mail inválido.');
      return;
    }
    this.auth.resendVerificationOtp(parsed.data);
  }

  onRequestForgotOtp(): void {
    if (this.isSubmitting()) {
      return;
    }
    const parsed = ForgotPasswordSchema.safeParse({ email: this.email() });
    if (!parsed.success) {
      this.localValidationError.set(parsed.error.issues[0]?.message ?? 'E-mail inválido.');
      return;
    }
    this.resetCodeRequested.set(true);
    this.auth.requestPasswordReset(parsed.data);
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.isSubmitting()) {
      return;
    }

    const activeMode = this.mode();
    if (activeMode === 'mfa-challenge') {
      this.submitMfaChallenge();
      return;
    }
    if (activeMode === 'register') {
      this.submitRegister();
      return;
    }
    if (activeMode === 'verify-email') {
      this.submitVerifyEmail();
      return;
    }
    if (activeMode === 'forgot') {
      if (!this.resetCodeRequested()) {
        this.onRequestForgotOtp();
        return;
      }
      this.submitResetPassword();
      return;
    }

    const parsed = LoginTrainerSchema.safeParse({
      email: this.email(),
      password: this.password(),
    });
    if (!parsed.success) {
      this.localValidationError.set(parsed.error.issues[0]?.message ?? 'Credenciais inválidas.');
      return;
    }
    this.auth.login(parsed.data);
  }

  private submitMfaChallenge(): void {
    const parsed = MfaChallengeVerifySchema.safeParse({
      method: this.useBackupCode() ? 'backup_code' : 'totp',
      code: this.otpCode(),
    });
    if (!parsed.success) {
      this.localValidationError.set(parsed.error.issues[0]?.message ?? 'Código 2FA inválido.');
      return;
    }
    this.auth.verifyMfaChallenge(parsed.data);
  }

  private submitRegister(): void {
    const parsed = RegisterTrainerSchema.safeParse({
      username: this.username(),
      email: this.email(),
      password: this.password(),
    });
    if (!parsed.success) {
      this.localValidationError.set(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    this.auth.register(parsed.data);
  }

  private submitVerifyEmail(): void {
    const parsed = VerifyEmailOtpSchema.safeParse({
      email: this.email(),
      code: this.otpCode(),
    });
    if (!parsed.success) {
      this.localValidationError.set(parsed.error.issues[0]?.message ?? 'Código OTP inválido.');
      return;
    }
    this.auth.verifyEmailOtp(parsed.data);
  }

  private submitResetPassword(): void {
    const parsed = ResetPasswordOtpSchema.safeParse({
      email: this.email(),
      code: this.otpCode(),
      newPassword: this.password(),
    });
    if (!parsed.success) {
      this.localValidationError.set(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    this.auth.resetPasswordWithOtp(parsed.data);
  }

  onNativeClose(): void {
    const dialog = this.dialogRef()?.nativeElement;
    if (dialog) {
      dialog.returnValue = '';
    }
    this.localValidationError.set(null);
    this.password.set('');
    this.otpCode.set('');
    this.auth.dismissVisitorPrompt();
  }

  onPointerDown(event: PointerEvent): void {
    if ('closedBy' in HTMLDialogElement.prototype) {
      return;
    }
    const dialog = this.dialogRef()?.nativeElement;
    this.pressedOutside = dialog ? this.isOutsideBoundingBox(event, dialog) : false;
  }

  onPointerUp(event: PointerEvent): void {
    if ('closedBy' in HTMLDialogElement.prototype) {
      return;
    }
    const dialog = this.dialogRef()?.nativeElement;
    if (this.pressedOutside && dialog && this.isOutsideBoundingBox(event, dialog)) {
      dialog.close();
    }
    this.pressedOutside = false;
  }

  private isOutsideBoundingBox(event: PointerEvent, dialog: HTMLDialogElement): boolean {
    const rect = dialog.getBoundingClientRect();
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  }
}
