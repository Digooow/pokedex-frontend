import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { type ActiveSessionFamily, TotpCodeInputSchema } from '@pokeverse/shared';
import { AuthStore } from '../../core/stores/auth.store';
import { PrivacyConsentStore } from '../../core/stores/privacy-consent.store';
import { SecurityIamStore } from '../../core/stores/security-iam.store';

@Component({
  selector: 'pv-security-settings-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './security-settings-dialog.component.html',
  styleUrl: './security-settings-dialog.component.scss',
})
export class SecuritySettingsDialogComponent {
  readonly auth = inject(AuthStore);
  readonly iam = inject(SecurityIamStore);
  private readonly privacy = inject(PrivacyConsentStore);
  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('secDialogEl');

  readonly totpCode = signal('');
  readonly disableCredential = signal('');
  readonly passkeyLabel = signal('Meu Dispositivo');
  readonly copiedCodes = signal(false);

  constructor() {
    effect(() => {
      const open = this.auth.securityModalOpen();
      const dialog = this.dialogRef()?.nativeElement;
      if (!dialog) {
        return;
      }
      if (open && !dialog.open && typeof dialog.showModal === 'function') {
        this.totpCode.set('');
        this.disableCredential.set('');
        this.copiedCodes.set(false);
        this.iam.openDialog();
        void this.iam.loadSessions();
        dialog.showModal();
      } else if (!open && dialog.open) {
        dialog.close();
      }
    });
  }

  onInputChange(field: 'totpCode' | 'disableCredential' | 'passkeyLabel', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    switch (field) {
      case 'totpCode':
        this.totpCode.set(value);
        break;
      case 'disableCredential':
        this.disableCredential.set(value);
        break;
      case 'passkeyLabel':
        this.passkeyLabel.set(value);
        break;
    }
  }

  onEnableTotp(event: Event): void {
    event.preventDefault();
    const parsed = TotpCodeInputSchema.safeParse({ code: this.totpCode() });
    if (!parsed.success) {
      return;
    }
    void this.iam.confirmTotpEnable(parsed.data.code);
  }

  onDisableTotp(event: Event): void {
    event.preventDefault();
    const raw = this.disableCredential().trim();
    if (!raw) {
      return;
    }
    const isCode = /^[a-zA-Z0-9-]{6,16}$/.test(raw) && (/^\d{6}$/.test(raw) || raw.includes('-'));
    void this.iam.disableTotp(isCode ? { code: raw } : { currentPassword: raw });
  }

  onAddPasskey(event: Event): void {
    event.preventDefault();
    void this.iam.registerPasskey(this.passkeyLabel());
  }

  async copyBackupCodes(codes: readonly string[]): Promise<void> {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      this.copiedCodes.set(true);
    } catch {
      this.copiedCodes.set(false);
    }
  }

  hasOtherSessions(sessions: readonly ActiveSessionFamily[]): boolean {
    return sessions.some((session) => !session.isCurrent);
  }

  formatDate(iso: string): string {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  openPrivacyCenter(): void {
    this.iam.closeDialog();
    this.privacy.openDialog();
  }

  onNativeClose(): void {
    const dialog = this.dialogRef()?.nativeElement;
    if (dialog) {
      dialog.returnValue = '';
    }
    this.totpCode.set('');
    this.disableCredential.set('');
    this.iam.closeDialog();
  }
}
