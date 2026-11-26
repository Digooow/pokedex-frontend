import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { type PokedexSlotRecord, formatPokeApiText } from '@pokeverse/shared';
import { PvRpgFocusableDirective } from '../directives/rpg-focusable.directive';
import { PokedexRpgNavService } from '../services/pokedex-rpg-nav.service';
import { PokedexSlotsStore } from '../services/pokedex-slots.store';
import { PokedexStore } from '../services/pokedex.store';

const SLOT_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export interface SlotFeedbackNotice {
  readonly label: string;
  readonly variant: 'sucesso' | 'aviso';
}

export interface ToggleSlotsConfigEvent {
  readonly moveFocus: boolean;
  readonly event?: Event;
}

@Component({
  selector: 'pv-pokedex-slots-grid',
  imports: [PvRpgFocusableDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: contents;
      }
    `,
  ],
  templateUrl: './pokedex-slots-grid.component.html',
})
export class PokedexSlotsGridComponent {
  readonly store = inject(PokedexStore);
  readonly slotsStore = inject(PokedexSlotsStore);
  readonly rpg = inject(PokedexRpgNavService);

  readonly slotIndices = SLOT_INDICES;
  readonly slotFeedback = output<SlotFeedbackNotice>();
  readonly slotOpenRequested = output<string>();
  readonly toggleConfigRequested = output<ToggleSlotsConfigEvent>();

  getSlot(slotIndex: number): PokedexSlotRecord | null {
    return this.slotsStore.slotsMap().get(slotIndex) ?? null;
  }

  isSlotActivePokemon(slotIndex: number): boolean {
    const slot = this.getSlot(slotIndex);
    const active = this.store.selectedPokemon();
    if (!slot || !active) {
      return false;
    }
    return slot.pokemonName.toLowerCase() === active.name.toLowerCase();
  }

  isSlotRpgFocused(index: number): boolean {
    return (
      this.rpg.keyboardRpgActive() &&
      this.store.coverOpen() &&
      this.rpg.rpgLevel() === 'itens' &&
      this.rpg.rpgScreen() === 'slots' &&
      this.rpg.rpgSlotFocusIndex() === index
    );
  }

  slotAriaLabel(slotIndex: number): string {
    const num = String(slotIndex + 1).padStart(2, '0');
    const slot = this.getSlot(slotIndex);
    if (!slot) {
      return `Slot ${num} livre. Clique para gravar o Pokémon exibido.`;
    }
    return `Slot ${num} salvo: ${this.formatSlotDisplayName(slot)}. Clique para abrir na Pokédex.`;
  }

  slotTitle(slotIndex: number): string {
    const num = String(slotIndex + 1).padStart(2, '0');
    const slot = this.getSlot(slotIndex);
    if (!slot) {
      return `Slot ${num} (livre) — clique para gravar o Pokémon exibido`;
    }
    return `Slot ${num}: ${this.formatSlotDisplayName(slot)} — clique para abrir`;
  }

  onSlotClick(slotIndex: number, event: Event): void {
    event.stopPropagation();
    this.rpg.deactivateKeyboardMode();
    (event.currentTarget as HTMLElement | null)?.blur?.();
    this.rpg.rpgLevel.set('itens');
    this.rpg.rpgScreen.set('slots');
    this.rpg.rpgSlotFocusIndex.set(slotIndex);

    const existing = this.getSlot(slotIndex);
    if (existing) {
      this.slotOpenRequested.emit(existing.pokemonName);
      return;
    }

    const active = this.store.selectedPokemon();
    if (!active) {
      this.slotFeedback.emit({ label: 'Busque p/ gravar', variant: 'aviso' });
      return;
    }

    const duplicateSlot = this.slotsStore.findSlotByPokemon(active.id, active.name, slotIndex);
    if (duplicateSlot !== null) {
      this.slotsStore.saveSlot(slotIndex, active);
      this.slotFeedback.emit({
        label: `Já salvo no slot ${String(duplicateSlot + 1).padStart(2, '0')}`,
        variant: 'aviso',
      });
      return;
    }

    if (this.slotsStore.saveSlot(slotIndex, active)) {
      this.slotFeedback.emit({
        label: `Salvo no slot ${String(slotIndex + 1).padStart(2, '0')}`,
        variant: 'sucesso',
      });
    }
  }

  onConfigClick(event: Event): void {
    event.stopPropagation();
    this.rpg.deactivateKeyboardMode();
    (event.currentTarget as HTMLElement | null)?.blur?.();
    this.toggleConfigRequested.emit({ moveFocus: false });
  }

  private formatSlotDisplayName(slot: PokedexSlotRecord): string {
    return slot.nickname
      ? `${slot.nickname} (${formatPokeApiText(slot.pokemonName)})`
      : formatPokeApiText(slot.pokemonName);
  }
}
