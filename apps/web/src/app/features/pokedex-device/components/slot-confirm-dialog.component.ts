import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
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

  onConfirmOverwriteEdit(
    prompt: Extract<
      NonNullable<ReturnType<PokedexSlotsStore['pendingConfirm']>>,
      { kind: 'overwrite-edit' }
    >,
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
