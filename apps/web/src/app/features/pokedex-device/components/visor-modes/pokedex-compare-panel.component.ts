import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { resolvePokemonTypeSlug } from '../../../../shared/utils/pokemon-type-style.util';
import { type CompareSide, PokedexCompareStore } from '../../services/pokedex-compare.store';
import { summarizeCompareVerdict } from '../../services/pokedex-compare.util';
import { COMPARE_DEFENSE_LABELS } from '../../services/pokedex-defense-matrix.util';
import { buildQuickCatalogSuggestions } from '../../services/pokedex-stat-calc.util';
import type { PokemonDetailView } from '../../services/pokedex-view-mapper.util';
import { PokedexStore } from '../../services/pokedex.store';

@Component({
  selector: 'pv-pokedex-compare-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pokedex-compare-panel.component.html',
  styleUrl: './pokedex-compare-panel.component.scss',
})
export class PokedexComparePanelComponent {
  readonly compare = inject(PokedexCompareStore);
  readonly pokedex = inject(PokedexStore);
  readonly typeSlug = resolvePokemonTypeSlug;

  readonly openInPokedex = output<string>();

  readonly leftQuery = signal('');
  readonly rightQuery = signal('');
  readonly editingLeft = signal(false);
  readonly editingRight = signal(false);

  readonly leftSuggestions = computed(() =>
    buildQuickCatalogSuggestions(this.pokedex.catalogState(), this.leftQuery()),
  );
  readonly rightSuggestions = computed(() => {
    const leftState = this.compare.leftState();
    const excludeName = leftState.status === 'success' ? leftState.data.name : null;
    const raw = buildQuickCatalogSuggestions(this.pokedex.catalogState(), this.rightQuery(), 6);
    if (!excludeName) return raw.slice(0, 5);
    return raw.filter((item) => item.name !== excludeName).slice(0, 5);
  });

  readonly bothReady = computed(
    () =>
      this.compare.leftState().status === 'success' &&
      this.compare.rightState().status === 'success',
  );

  readonly verdict = computed(() => summarizeCompareVerdict(this.compare.statRows()));

  readonly leftName = computed(() => {
    const state = this.compare.leftState();
    return state.status === 'success' ? state.data.displayName : 'Lado A';
  });

  readonly rightName = computed(() => {
    const state = this.compare.rightState();
    return state.status === 'success' ? state.data.displayName : 'Lado B';
  });

  constructor() {
    this.pokedex.ensureCatalogLoaded();
  }

  isSideEditing(side: CompareSide): boolean {
    return side === 'left' ? this.editingLeft() : this.editingRight();
  }

  onToggleEdit(side: CompareSide): void {
    if (side === 'left') this.editingLeft.update((prev) => !prev);
    else this.editingRight.update((prev) => !prev);
  }

  primaryTypeSlug(pokemon: PokemonDetailView): string | null {
    return pokemon.types[0] ? this.typeSlug(pokemon.types[0]) : null;
  }

  bstOf(pokemon: PokemonDetailView): number {
    if (pokemon.bundle?.pokemon.baseStatTotal) return pokemon.bundle.pokemon.baseStatTotal;
    return pokemon.stats.reduce((sum, stat) => sum + stat.value, 0);
  }

  onQueryInput(side: CompareSide, event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    if (side === 'left') this.leftQuery.set(val);
    else this.rightQuery.set(val);
  }

  onSubmitSide(side: CompareSide, event: Event): void {
    event.preventDefault();
    const raw = (side === 'left' ? this.leftQuery() : this.rightQuery()).trim();
    if (!raw) return;
    this.closeEditor(side);
    this.compare.selectSide(side, raw);
  }

  onPickSuggestion(side: CompareSide, pokemonName: string): void {
    if (side === 'left') this.leftQuery.set(pokemonName);
    else this.rightQuery.set(pokemonName);
    this.closeEditor(side);
    this.compare.selectSide(side, pokemonName);
  }

  onUseSelectedOnSide(side: CompareSide): void {
    const active = this.pokedex.selectedPokemon();
    if (!active) return;
    this.closeEditor(side);
    if (side === 'left') {
      this.leftQuery.set(active.name);
      this.compare.openWithPokemon(active);
      return;
    }
    this.rightQuery.set(active.name);
    this.compare.selectSide('right', active.name);
  }

  onOpenInPokedex(pokemonName: string): void {
    this.openInPokedex.emit(pokemonName);
  }

  private closeEditor(side: CompareSide): void {
    if (side === 'left') this.editingLeft.set(false);
    else this.editingRight.set(false);
  }
}
