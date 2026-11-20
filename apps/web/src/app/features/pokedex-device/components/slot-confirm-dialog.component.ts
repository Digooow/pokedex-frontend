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
  styles: [
    `
      .slot-dialog {
        padding: 0;
        border: 1px solid var(--pv-border-gold);
        border-radius: var(--pv-radius-lg);
        background: var(--pv-surface-solid);
        color: var(--pv-ink-primary);
        inline-size: min(28rem, calc(100vw - 2rem));
        box-shadow: 0 24px 60px oklch(0% 0 0 / 0.7);
      }

      .slot-dialog:not([open]) {
        display: none;
      }

      .slot-dialog__card {
        display: grid;
        gap: var(--pv-space-3);
        padding: var(--pv-space-5);
      }

      .slot-dialog__badge {
        justify-self: start;
        padding: 0.2rem 0.6rem;
        border-radius: var(--pv-radius-pill);
        border: 1px solid var(--pv-border-gold);
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.05em;
        color: var(--pv-border-gold);
      }

      .slot-dialog__title {
        margin: 0;
        font-size: 1.15rem;
        line-height: 1.25;
      }

      .slot-dialog__desc {
        margin: 0;
        font-size: 0.9rem;
        color: var(--pv-ink-muted);
      }

      .slot-dialog__actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: var(--pv-space-2);
        margin-block-start: var(--pv-space-1);
      }

      .slot-dialog__btn {
        min-block-size: 2.5rem;
        padding: 0.45rem 0.95rem;
        border-radius: var(--pv-radius-sm);
        border: 1px solid var(--pv-border-subtle);
        background: var(--pv-surface-elevated);
        color: var(--pv-ink-primary);
        font-size: 0.85rem;
        font-weight: 700;
        cursor: pointer;
        transition: filter 120ms ease, transform 80ms ease;
      }

      .slot-dialog__btn:hover {
        filter: brightness(1.12);
      }

      .slot-dialog__btn:active {
        transform: translateY(1px);
      }

      .slot-dialog__btn--primary {
        border-color: var(--pv-amber);
        background: linear-gradient(180deg, oklch(68% 0.16 84), oklch(54% 0.15 76));
        color: oklch(14% 0.02 255);
      }

      .slot-dialog__btn--danger {
        border-color: var(--pv-danger);
        background: linear-gradient(180deg, oklch(56% 0.21 25), oklch(42% 0.19 25));
        color: #fff;
      }
    `,
  ],
  template: `
    <dialog
      #dialogEl
      class="slot-dialog"
      aria-labelledby="pv-slot-confirm-title"
      closedby="any"
      (close)="onNativeClose()"
    >
      @if (slotsStore.pendingConfirm(); as prompt) {
        <div class="slot-dialog__card">
          @switch (prompt.kind) {
            @case ('overwrite-click') {
              <span class="slot-dialog__badge">BOTÃO #{{ pad(prompt.slotIndex) }}</span>
              @if (prompt.duplicateSlotIndex !== null) {
                <h2 id="pv-slot-confirm-title" class="slot-dialog__title">
                  {{ prompt.candidate.displayName }} já está em outro botão
                </h2>
                <p class="slot-dialog__desc">
                  {{ prompt.candidate.displayName }} já está salvo no Botão #{{ pad(prompt.duplicateSlotIndex) }}.
                  Cada Pokémon pode ocupar apenas um botão. Deseja abrir {{ prompt.existingLabel }} que está salvo aqui?
                </p>
                <div class="slot-dialog__actions">
                  <button
                    type="button"
                    class="slot-dialog__btn slot-dialog__btn--primary"
                    (click)="onOpenExisting(prompt.existingName)"
                  >
                    Abrir {{ prompt.existingLabel }}
                  </button>
                  <button type="button" class="slot-dialog__btn" (click)="closeDialog()">
                    Cancelar
                  </button>
                </div>
              } @else {
                <h2 id="pv-slot-confirm-title" class="slot-dialog__title">
                  Sobrescrever botão #{{ pad(prompt.slotIndex) }}?
                </h2>
                <p class="slot-dialog__desc">
                  Este botão já guarda <strong>{{ prompt.existingLabel }}</strong>. Deseja reescrever
                  com <strong>{{ prompt.candidate.displayName }}</strong> ou apenas abrir o Pokémon salvo?
                </p>
                <div class="slot-dialog__actions">
                  <button
                    type="button"
                    class="slot-dialog__btn slot-dialog__btn--primary"
                    (click)="onConfirmOverwriteClick(prompt.slotIndex, prompt.candidate)"
                  >
                    Reescrever com {{ prompt.candidate.displayName }}
                  </button>
                  <button
                    type="button"
                    class="slot-dialog__btn"
                    (click)="onOpenExisting(prompt.existingName)"
                  >
                    Abrir {{ prompt.existingLabel }}
                  </button>
                  <button type="button" class="slot-dialog__btn" (click)="closeDialog()">
                    Cancelar
                  </button>
                </div>
              }
            }

            @case ('overwrite-edit') {
              <span class="slot-dialog__badge">EDITAR BOTÃO #{{ pad(prompt.slotIndex) }}</span>
              <h2 id="pv-slot-confirm-title" class="slot-dialog__title">
                Confirmar substituição do Pokémon?
              </h2>
              <p class="slot-dialog__desc">
                O Botão #{{ pad(prompt.slotIndex) }} já possui <strong>{{ prompt.existingLabel }}</strong>.
                Deseja realmente reescrever este botão com <strong>{{ prompt.nextPokemon.displayName }}</strong>?
              </p>
              <div class="slot-dialog__actions">
                <button
                  type="button"
                  class="slot-dialog__btn slot-dialog__btn--primary"
                  (click)="onConfirmOverwriteEdit(prompt)"
                >
                  Sim, reescrever
                </button>
                <button type="button" class="slot-dialog__btn" (click)="closeDialog()">
                  Cancelar
                </button>
              </div>
            }

            @case ('delete-one') {
              <span class="slot-dialog__badge">REMOVER BOTÃO #{{ pad(prompt.slotIndex) }}</span>
              <h2 id="pv-slot-confirm-title" class="slot-dialog__title">
                Deseja realmente remover este Pokémon?
              </h2>
              <p class="slot-dialog__desc">
                <strong>{{ prompt.existingLabel }}</strong> será removido do Botão #{{ pad(prompt.slotIndex) }}.
              </p>
              <div class="slot-dialog__actions">
                <button
                  type="button"
                  class="slot-dialog__btn slot-dialog__btn--danger"
                  (click)="onConfirmDeleteOne(prompt.slotIndex)"
                >
                  Sim, remover
                </button>
                <button type="button" class="slot-dialog__btn" (click)="closeDialog()">
                  Cancelar
                </button>
              </div>
            }

            @case ('delete-all') {
              <span class="slot-dialog__badge">LIMPAR SLOTS</span>
              <h2 id="pv-slot-confirm-title" class="slot-dialog__title">
                Apagar todos os Pokémon salvos?
              </h2>
              <p class="slot-dialog__desc">
                Deseja realmente limpar todos os {{ prompt.occupiedCount }} Pokémon cadastrados nos botões da Pokédex?
              </p>
              <div class="slot-dialog__actions">
                <button
                  type="button"
                  class="slot-dialog__btn slot-dialog__btn--danger"
                  (click)="onConfirmDeleteAll()"
                >
                  Sim, apagar todos
                </button>
                <button type="button" class="slot-dialog__btn" (click)="closeDialog()">
                  Cancelar
                </button>
              </div>
            }
          }
        </div>
      }
    </dialog>
  `,
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
      if (!dialog) {
        return;
      }
      if (prompt) {
        if (!dialog.open && typeof dialog.showModal === 'function') {
          dialog.showModal();
        }
      } else if (dialog.open) {
        dialog.close();
      }
    });
  }

  pad(slotIndex: number): string {
    return String(slotIndex + 1).padStart(2, '0');
  }

  onNativeClose(): void {
    if (this.slotsStore.pendingConfirm() !== null) {
      this.slotsStore.closeConfirm();
    }
  }

  closeDialog(): void {
    this.slotsStore.closeConfirm();
  }

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
    if (saved) {
      this.overwrittenFromClick.emit({ slotIndex, name: candidate.displayName });
    }
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
