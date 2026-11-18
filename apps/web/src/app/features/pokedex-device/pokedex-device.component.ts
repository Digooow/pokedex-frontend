import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input } from '@angular/core';
import { type PokedexSlotRecord, TOTAL_POKEDEX_SLOTS } from '@pokeverse/shared';
import { AuthStore } from '../../core/stores/auth.store';
import { RequiresTrainerDirective } from '../../shared/directives/requires-trainer.directive';
import { PokedexSearchPanelComponent } from './components/pokedex-search-panel.component';
import { PokedexVisorComponent } from './components/pokedex-visor.component';
import { PokedexSlotsStore } from './services/pokedex-slots.store';
import { PokedexStore, type ScenarioId } from './services/pokedex.store';

interface ScenarioOption {
  readonly id: ScenarioId;
  readonly label: string;
  readonly baseFile: string;
}

const SCENARIO_OPTIONS: readonly ScenarioOption[] = [
  { id: 'hoenn', label: 'Hoenn', baseFile: 'mirante-hoenn' },
  { id: 'cidade', label: 'Cidade', baseFile: 'cidade-anime' },
  { id: 'vila', label: 'Vila', baseFile: 'vila-pallet' },
  { id: 'floresta', label: 'Floresta', baseFile: 'floresta-sol' },
];

@Component({
  selector: 'pv-pokedex-device-page',
  imports: [PokedexSearchPanelComponent, PokedexVisorComponent, RequiresTrainerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pokedex-device.component.html',
  styleUrl: './pokedex-device.component.scss',
})
export class PokedexDevicePageComponent implements OnInit {
  readonly store = inject(PokedexStore);
  readonly slotsStore = inject(PokedexSlotsStore);
  readonly auth = inject(AuthStore);
  readonly q = input<string>();

  readonly scenarios = SCENARIO_OPTIONS;
  readonly slotIndices = Array.from({ length: TOTAL_POKEDEX_SLOTS }, (_, index) => index);

  readonly activeBackdrop = computed(() => {
    const chosen = SCENARIO_OPTIONS.find((item) => item.id === this.store.scenario());
    const base = chosen?.baseFile ?? 'mirante-hoenn';
    return {
      mobile: `assets/backgrounds/${base}-mobile.webp`,
      desktop: `assets/backgrounds/${base}-desktop.webp`,
    };
  });

  ngOnInit(): void {
    this.store.ensureCatalogLoaded();
    const initialQuery = this.q()?.trim();
    if (initialQuery) {
      this.store.searchOrSelect(initialQuery);
    }
  }

  retrySelected(): void {
    const term = this.store.query().trim() || String(this.store.selectedId() ?? 'pikachu');
    this.store.loadPokemonDetail(term);
  }

  slotRecordAt(slotIndex: number): PokedexSlotRecord | null {
    return this.slotsStore.slotsMap().get(slotIndex) ?? null;
  }

  slotButtonLabel(slotIndex: number): string {
    const record = this.slotRecordAt(slotIndex);
    if (!record) {
      return `Slot ${slotIndex + 1} livre na nuvem`;
    }
    const padded = String(record.pokemonId).padStart(4, '0');
    return this.slotsStore.editMode()
      ? `Remover ou substituir Slot ${slotIndex + 1}: ${record.pokemonName} (#${padded})`
      : `Abrir Slot ${slotIndex + 1}: ${record.pokemonName} (#${padded})`;
  }

  onTrainerSlotClick(slotIndex: number): void {
    if (!this.auth.isAuthenticated()) {
      return;
    }

    const existing = this.slotRecordAt(slotIndex);
    const activePokemon = this.store.selectedPokemon();

    if (this.slotsStore.editMode()) {
      if (existing && (!activePokemon || existing.pokemonId === activePokemon.id)) {
        this.slotsStore.clearSlot(slotIndex);
        return;
      }
      if (activePokemon) {
        this.slotsStore.saveSlot(slotIndex, activePokemon);
        return;
      }
      this.slotsStore.notifyHint('Selecione um Pokémon no visor para sobrescrever o slot.');
      return;
    }

    if (existing) {
      this.store.loadPokemonDetail(existing.pokemonId);
      return;
    }

    if (!activePokemon) {
      this.slotsStore.notifyHint('Busque ou selecione um Pokémon no visor antes de gravar neste slot.');
      return;
    }

    this.slotsStore.saveSlot(slotIndex, activePokemon);
  }
}
