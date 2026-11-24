import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ApiCreditsStore {
  private readonly dialogOpenSignal = signal(false);

  readonly dialogOpen = this.dialogOpenSignal.asReadonly();

  openDialog(): void {
    this.dialogOpenSignal.set(true);
  }

  closeDialog(): void {
    this.dialogOpenSignal.set(false);
  }
}
