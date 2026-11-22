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
import { type AuthDialogMode, AuthStore } from '../../core/stores/auth.store';
import {
  validateAuthDialogSubmission,
  validateForgotPasswordEmail,
  validateResendVerificationEmail,
} from './auth-dialog-validator.util';

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
    if (local) return local;
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
      if (!dialog) return;
      if (!prompt) {
        if (dialog.open) dialog.close();
        return;
      }
      this.localValidationError.set(null);
      this.mode.set(prompt.initialMode ?? 'login');
      const loggedTrainer = this.auth.trainer();
      if (loggedTrainer && !this.email()) this.email.set(loggedTrainer.email);
      if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
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
    if (field === 'username') this.username.set(value);
    else if (field === 'email') this.email.set(value);
    else if (field === 'password') this.password.set(value);
    else this.otpCode.set(value);
  }

  onPasskeySignIn(): void {
    if (this.isSubmitting()) return;
    const rawEmail = this.email().trim().toLowerCase();
    void this.auth.loginWithPasskey(rawEmail || undefined);
  }

  onResendVerificationOtp(): void {
    if (this.isSubmitting()) return;
    const result = validateResendVerificationEmail(this.email());
    if (!result.ok) {
      this.localValidationError.set(result.error);
      return;
    }
    this.auth.resendVerificationOtp(result.data);
  }

  onRequestForgotOtp(): void {
    if (this.isSubmitting()) return;
    const result = validateForgotPasswordEmail(this.email());
    if (!result.ok) {
      this.localValidationError.set(result.error);
      return;
    }
    this.resetCodeRequested.set(true);
    this.auth.requestPasswordReset(result.data);
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.isSubmitting()) return;

    const result = validateAuthDialogSubmission({
      mode: this.mode(),
      username: this.username(),
      email: this.email(),
      password: this.password(),
      otpCode: this.otpCode(),
      useBackupCode: this.useBackupCode(),
      resetCodeRequested: this.resetCodeRequested(),
    });
    if (!result.ok) {
      this.localValidationError.set(result.error);
      return;
    }

    const { command } = result;
    switch (command.kind) {
      case 'login':
        this.auth.login(command.data);
        return;
      case 'register':
        this.auth.register(command.data);
        return;
      case 'mfa-challenge':
        this.auth.verifyMfaChallenge(command.data);
        return;
      case 'verify-email':
        this.auth.verifyEmailOtp(command.data);
        return;
      case 'forgot-request':
        this.resetCodeRequested.set(true);
        this.auth.requestPasswordReset(command.data);
        return;
      case 'forgot-reset':
        this.auth.resetPasswordWithOtp(command.data);
        return;
    }
  }

  onNativeClose(): void {
    const dialog = this.dialogRef()?.nativeElement;
    if (dialog) dialog.returnValue = '';
    this.localValidationError.set(null);
    this.password.set('');
    this.otpCode.set('');
    this.auth.dismissVisitorPrompt();
  }

  onPointerDown(event: PointerEvent): void {
    if ('closedBy' in HTMLDialogElement.prototype) return;
    const dialog = this.dialogRef()?.nativeElement;
    this.pressedOutside = dialog ? this.isOutsideBoundingBox(event, dialog) : false;
  }

  onPointerUp(event: PointerEvent): void {
    if ('closedBy' in HTMLDialogElement.prototype) return;
    const dialog = this.dialogRef()?.nativeElement;
    if (this.pressedOutside && dialog && this.isOutsideBoundingBox(event, dialog)) dialog.close();
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
