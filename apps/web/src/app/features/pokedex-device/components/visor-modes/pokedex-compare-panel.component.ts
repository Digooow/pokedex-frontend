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
import { buildQuickCatalogSuggestions } from '../../services/pokedex-stat-calc.util';
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
  readonly backToFicha = output<void>();

  readonly leftQuery = signal('');
  readonly rightQuery = signal('');

  readonly leftSuggestions = computed(() =>
    buildQuickCatalogSuggestions(this.pokedex.catalogState(), this.leftQuery()),
  );
  readonly rightSuggestions = computed(() =>
    buildQuickCatalogSuggestions(this.pokedex.catalogState(), this.rightQuery()),
  );

  readonly bothReady = computed(
    () =>
      this.compare.leftState().status === 'success' &&
      this.compare.rightState().status === 'success',
  );

  constructor() {
    this.pokedex.ensureCatalogLoaded();
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
    this.compare.selectSide(side, raw);
  }

  onPickSuggestion(side: CompareSide, pokemonName: string): void {
    if (side === 'left') this.leftQuery.set(pokemonName);
    else this.rightQuery.set(pokemonName);
    this.compare.selectSide(side, pokemonName);
  }

  onUseSelectedOnSide(side: CompareSide): void {
    const active = this.pokedex.selectedPokemon();
    if (!active) return;
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
}
