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
import { LoginTrainerSchema, RegisterTrainerSchema } from '@pokeverse/shared';
import { AuthStore } from '../../core/stores/auth.store';

type AuthFormMode = 'login' | 'register';

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

  readonly mode = signal<AuthFormMode>('login');
  readonly username = signal('');
  readonly email = signal('');
  readonly password = signal('');
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

  constructor() {
    effect(() => {
      const prompt = this.auth.visitorPrompt();
      const dialog = this.dialogRef()?.nativeElement;
      if (!dialog) {
        return;
      }
      if (prompt && !dialog.open) {
        this.localValidationError.set(null);
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        }
      } else if (!prompt && dialog.open) {
        dialog.close();
      }
    });
  }

  switchMode(nextMode: AuthFormMode): void {
    this.mode.set(nextMode);
    this.localValidationError.set(null);
    this.auth.clearMutationError();
  }

  onUsernameInput(event: Event): void {
    this.username.set((event.target as HTMLInputElement).value);
    this.localValidationError.set(null);
  }

  onEmailInput(event: Event): void {
    this.email.set((event.target as HTMLInputElement).value);
    this.localValidationError.set(null);
  }

  onPasswordInput(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
    this.localValidationError.set(null);
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.isSubmitting()) {
      return;
    }

    if (this.mode() === 'register') {
      const parsed = RegisterTrainerSchema.safeParse({
        username: this.username(),
        email: this.email(),
        password: this.password(),
      });
      if (!parsed.success) {
        this.localValidationError.set(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
        return;
      }
      this.localValidationError.set(null);
      this.auth.register(parsed.data);
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
    this.localValidationError.set(null);
    this.auth.login(parsed.data);
  }

  onNativeClose(): void {
    const dialog = this.dialogRef()?.nativeElement;
    if (dialog) {
      dialog.returnValue = '';
    }
    this.localValidationError.set(null);
    this.password.set('');
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
