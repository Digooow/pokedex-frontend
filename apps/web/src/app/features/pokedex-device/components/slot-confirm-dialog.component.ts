import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { PokedexSlotsStore } from '../services/pokedex-slots.store';

@Component({
  selector: 'pv-slot-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './slot-confirm-dialog.component.html',
  styleUrl: './slot-confirm-dialog.component.scss',
})
export class SlotConfirmDialogComponent {
  readonly slotsStore = inject(PokedexSlotsStore);
  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

  readonly openExistingRequested = output<string>();
  readonly overwrittenFromClick = output<{ readonly slotIndex: number; readonly name: string }>();

  constructor() {
    effect(() => {
      const prompt = this.slotsStore.pendingConfirm();
      const dialog = this.dialogRef()?.nativeElement;
      if (!dialog) return;
      if (prompt) {
        if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
      } else if (dialog.open) {
        dialog.close();
      }
    });
  }

  pad = (slotIndex: number) => String(slotIndex + 1).padStart(2, '0');

  onNativeClose(): void {
    if (this.slotsStore.pendingConfirm() !== null) this.slotsStore.closeConfirm();
  }

  closeDialog = () => this.slotsStore.closeConfirm();

  onOpenExisting(existingName: string): void {
    this.slotsStore.closeConfirm();
    this.openExistingRequested.emit(existingName);
  }

  onConfirmOverwriteClick(
    slotIndex: number,
    candidate: Extract<NonNullable<ReturnType<PokedexSlotsStore['pendingConfirm']>>, { kind: 'overwrite-click' }>['candidate'],
  ): void {
    const saved = this.slotsStore.saveSlot(slotIndex, candidate);
    this.slotsStore.closeConfirm();
    if (saved) this.overwrittenFromClick.emit({ slotIndex, name: candidate.displayName });
  }

  onConfirmOverwriteEdit(
    prompt: Extract<NonNullable<ReturnType<PokedexSlotsStore['pendingConfirm']>>, { kind: 'overwrite-edit' }>,
  ): void {
    this.slotsStore.saveSlot(prompt.slotIndex, prompt.nextPokemon, prompt.nickname);
    this.slotsStore.closeConfirm();
  }

  onConfirmDeleteOne(slotIndex: number): void {
    this.slotsStore.clearSlot(slotIndex);
    this.slotsStore.closeConfirm();
  }

  onConfirmDeleteAll(): void {
    this.slotsStore.clearAllSlots();
    this.slotsStore.closeConfirm();
  }
}
