import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { type PokedexSlotRecord, formatPokeApiText } from '@pokeverse/shared';
import { AuthStore } from '../../../core/stores/auth.store';
import {
  PvRpgEditFormDirective,
  PvRpgFocusableDirective,
} from '../directives/rpg-focusable.directive';
import { PokedexRpgNavService } from '../services/pokedex-rpg-nav.service';
import { PokedexSlotsStore } from '../services/pokedex-slots.store';
import { PokedexStore } from '../services/pokedex.store';

const SLOT_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

@Component({
  selector: 'pv-pokedex-slots-config',
  imports: [PvRpgFocusableDirective, PvRpgEditFormDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pokedex-slots-config.component.html',
  styleUrl: './pokedex-slots-config.component.scss',
})
export class PokedexSlotsConfigComponent {
  readonly slotsStore = inject(PokedexSlotsStore);
  readonly pokedex = inject(PokedexStore);
  private readonly auth = inject(AuthStore);
  private readonly rpg = inject(PokedexRpgNavService);

  readonly closeRequested = output<void>();
  readonly slotOpened = output<string>();

  readonly indices = SLOT_INDICES;
  readonly draftTerm = signal('');
  readonly draftNickname = signal('');
  readonly editError = signal<string | null>(null);
  readonly savingEdit = signal(false);

  getSlot = (idx: number): PokedexSlotRecord | null => this.slotsStore.slotsMap().get(idx) ?? null;
  padIndex = (idx: number): string => String(idx + 1).padStart(2, '0');
  readValue = (event: Event): string => (event.target as HTMLInputElement).value;
  findSavedSlot = (pokemonId: number, pokemonName: string): number | null =>
    this.slotsStore.findSlotByPokemon(pokemonId, pokemonName);

  formatSlotLabel(slot: PokedexSlotRecord): string {
    const display = formatPokeApiText(slot.pokemonName);
    const idSuffix = slot.pokemonId > 0 ? ` (#${String(slot.pokemonId).padStart(4, '0')})` : '';
    return slot.nickname ? `${slot.nickname} — ${display}` : `${display}${idSuffix}`;
  }

  onRequestTrainerLogin(event: Event): void {
    event.stopPropagation();
    this.auth.requestTrainerAccess(
      'Sincronizar Slots na Nuvem',
      'Entre com sua conta de Treinador para gravar e editar os 10 slots no Neon PostgreSQL.',
    );
  }

  onClearAll(event: Event): void {
    event.stopPropagation();
    const occupiedCount = this.slotsStore.slotsMap().size;
    if (occupiedCount === 0) return;
    this.slotsStore.requestConfirm({ kind: 'delete-all', occupiedCount });
  }

  onCloseConfig(event: Event): void {
    event.stopPropagation();
    this.closeRequested.emit();
  }

  onOpenSlot(slot: PokedexSlotRecord, event: Event): void {
    event.stopPropagation();
    this.slotsStore.setEditMode(false);
    this.pokedex.setQuery(slot.pokemonName);
    this.pokedex.loadPokemonDetail(slot.pokemonName);
    this.slotOpened.emit(slot.pokemonName);
  }

  onToggleEditSlot(slot: PokedexSlotRecord, idx: number, event: Event): void {
    event.stopPropagation();
    const opening = this.slotsStore.editingSlotIndex() !== idx;
    this.editError.set(null);
    if (!opening) {
      this.slotsStore.setEditingSlotIndex(null);
      this.rpg.rpgLevel.set('itens');
      return;
    }
    this.draftTerm.set(slot.pokemonName);
    this.draftNickname.set(slot.nickname ?? '');
    this.slotsStore.setEditingSlotIndex(idx);
    this.rpg.rpgLevel.set('edicao');
    this.rpg.rpgScreen.set('visor');
    this.rpg.rpgControlIndices.update((prev) => ({ ...prev, edicao: 0 }));
    if (this.rpg.keyboardRpgActive()) {
      setTimeout(() => this.rpg.syncFocusVisuals(true), 0);
    }
  }

  onCancelEdit(event: Event): void {
    event.stopPropagation();
    this.editError.set(null);
    this.slotsStore.setEditingSlotIndex(null);
    this.rpg.rpgLevel.set('itens');
    if (this.rpg.keyboardRpgActive()) {
      setTimeout(() => this.rpg.syncFocusVisuals(true), 0);
    }
  }

  onRemoveSlot(idx: number, event: Event): void {
    event.stopPropagation();
    const slot = this.getSlot(idx);
    if (!slot) return;
    this.slotsStore.requestConfirm({
      kind: 'delete-one',
      slotIndex: idx,
      existingLabel: `#${this.padIndex(idx)} ${this.formatSlotLabel(slot)}`,
    });
  }

  onRecordCurrent(idx: number, event: Event): void {
    event.stopPropagation();
    const active = this.pokedex.selectedPokemon();
    if (active) this.slotsStore.saveSlot(idx, active);
  }

  async onSaveEdit(event: Event, idx: number, slotAtual: PokedexSlotRecord): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const term = this.draftTerm().trim().toLowerCase().replaceAll(/\s+/g, '-');
    const nickname = this.draftNickname().trim().slice(0, 40) || null;
    if (!term) {
      this.editError.set('Informe um nome ou ID válido da PokéAPI.');
      return;
    }

    if (term === slotAtual.pokemonName.toLowerCase()) {
      this.editError.set(null);
      this.slotsStore.saveSlot(
        idx,
        {
          id: slotAtual.pokemonId,
          name: slotAtual.pokemonName,
          displayName: formatPokeApiText(slotAtual.pokemonName),
          spriteUrl: slotAtual.spriteUrl,
        },
        nickname,
      );
      this.rpg.rpgLevel.set('itens');
      return;
    }

    this.savingEdit.set(true);
    this.editError.set(null);
    try {
      const resolved = await this.pokedex.resolvePokemonForSlot(term);
      if (!resolved) {
        this.editError.set('Pokémon não encontrado na PokéAPI. Verifique o nome ou ID.');
        return;
      }
      const dupSlot = this.slotsStore.findSlotByPokemon(resolved.id, resolved.name, idx);
      if (dupSlot !== null) {
        this.editError.set(
          `${resolved.displayName} já está cadastrado no Botão #${this.padIndex(dupSlot)}. Apenas 1 Pokémon por botão.`,
        );
        return;
      }
      this.slotsStore.requestConfirm({
        kind: 'overwrite-edit',
        slotIndex: idx,
        existingLabel: this.formatSlotLabel(slotAtual),
        nextPokemon: resolved,
        nickname,
      });
      this.rpg.rpgLevel.set('itens');
    } finally {
      this.savingEdit.set(false);
    }
  }
}
