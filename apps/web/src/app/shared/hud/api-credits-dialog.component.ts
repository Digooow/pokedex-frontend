import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { ApiCreditsStore } from '../../core/stores/api-credits.store';

@Component({
  selector: 'pv-api-credits-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './api-credits-dialog.component.html',
  styleUrl: './api-credits-dialog.component.scss',
})
export class ApiCreditsDialogComponent {
  readonly apiCredits = inject(ApiCreditsStore);
  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('creditsDialogEl');

  constructor() {
    effect(() => {
      const open = this.apiCredits.dialogOpen();
      const dialog = this.dialogRef()?.nativeElement;
      if (!dialog) {
        return;
      }
      if (open && !dialog.open && typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else if (!open && dialog.open) {
        dialog.close();
      }
    });
  }

  onNativeClose(): void {
    const dialog = this.dialogRef()?.nativeElement;
    if (dialog) {
      dialog.returnValue = '';
    }
    this.apiCredits.closeDialog();
  }
}
