import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { filterPokemonCatalog } from '@pokeverse/shared';
import { DialogLightDismissDirective } from '../../../shared/directives/dialog-light-dismiss.directive';
import { resolvePokemonTypeSlug } from '../../../shared/utils/pokemon-type-style.util';
import { type CompareSide, PokedexCompareStore } from '../services/pokedex-compare.store';
import { PokedexStore } from '../services/pokedex.store';

@Component({
  selector: 'pv-pokedex-compare-dialog',
  imports: [DialogLightDismissDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pokedex-compare-dialog.component.html',
  styleUrl: './pokedex-compare-dialog.component.scss',
})
export class PokedexCompareDialogComponent {
  readonly compare = inject(PokedexCompareStore);
  readonly pokedex = inject(PokedexStore);
  readonly typeSlug = resolvePokemonTypeSlug;
  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

  readonly openInPokedex = output<string>();

  readonly leftQuery = signal('');
  readonly rightQuery = signal('');

  readonly leftSuggestions = computed(() => this.buildQuickSuggestions(this.leftQuery()));
  readonly rightSuggestions = computed(() => this.buildQuickSuggestions(this.rightQuery()));

  readonly bothReady = computed(
    () =>
      this.compare.leftState().status === 'success' &&
      this.compare.rightState().status === 'success',
  );

  constructor() {
    effect(() => {
      const open = this.compare.dialogOpen();
      const dialog = this.dialogRef()?.nativeElement;
      if (!dialog) return;
      if (!open) {
        if (dialog.open) dialog.close();
        return;
      }
      this.pokedex.ensureCatalogLoaded();
      if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
    });
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

  onOpenInPokedex(pokemonName: string): void {
    this.compare.close();
    this.openInPokedex.emit(pokemonName);
  }

  onNativeClose(): void {
    this.compare.close();
  }

  private buildQuickSuggestions(rawTerm: string) {
    const state = this.pokedex.catalogState();
    if (state.status !== 'success') return [];
    const term = rawTerm.trim();
    if (!term) return state.data.slice(0, 6);
    return filterPokemonCatalog(state.data, term, 6).items;
  }
}
