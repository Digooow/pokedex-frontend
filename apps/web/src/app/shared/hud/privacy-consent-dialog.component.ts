import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { AuthStore } from '../../core/stores/auth.store';
import { PrivacyConsentStore } from '../../core/stores/privacy-consent.store';
import { SecurityIamStore } from '../../core/stores/security-iam.store';

@Component({
  selector: 'pv-privacy-consent-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './privacy-consent-dialog.component.html',
  styleUrl: './privacy-consent-dialog.component.scss',
})
export class PrivacyConsentDialogComponent {
  readonly privacy = inject(PrivacyConsentStore);
  readonly auth = inject(AuthStore);
  private readonly securityIam = inject(SecurityIamStore);
  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('privDialogEl');

  readonly functionalPref = signal(true);
  readonly telemetryPref = signal(false);
  readonly localClearedMsg = signal<string | null>(null);

  constructor() {
    effect(() => {
      const open = this.privacy.dialogOpen();
      const dialog = this.dialogRef()?.nativeElement;
      if (!dialog) {
        return;
      }
      if (open && !dialog.open && typeof dialog.showModal === 'function') {
        const current = this.privacy.consent();
        this.functionalPref.set(current?.functionalPreferences ?? true);
        this.telemetryPref.set(current?.optionalTelemetry ?? false);
        this.localClearedMsg.set(null);
        dialog.showModal();
      } else if (!open && dialog.open) {
        dialog.close();
      }
    });
  }

  onToggleFunctional(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.functionalPref.set(checked);
  }

  onToggleTelemetry(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.telemetryPref.set(checked);
  }

  onClearLocalStorage(): void {
    this.privacy.clearLocalNonEssentialStorage();
    this.localClearedMsg.set('Preferências locais e slots de visitante foram removidos deste navegador.');
  }

  onSaveCustom(): void {
    this.privacy.savePreferences(this.functionalPref(), this.telemetryPref());
  }

  openTrainerSecurityAndExport(): void {
    this.privacy.closeDialog();
    this.securityIam.openDialog();
  }

  onNativeClose(): void {
    const dialog = this.dialogRef()?.nativeElement;
    if (dialog) {
      dialog.returnValue = '';
    }
    this.localClearedMsg.set(null);
    this.privacy.closeDialog();
  }
}
