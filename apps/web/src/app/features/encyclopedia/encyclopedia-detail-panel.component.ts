import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AsyncState } from '@pokeverse/shared';
import type { EncyclopediaResourceKey } from '@pokeverse/shared/pokedex-encyclopedia';
import { extractPokemonTypeFromBadge } from '../../shared/utils/pokemon-type-style.util';
import type { EncyclopediaDetailPayload } from './encyclopedia-catalog.config';
import { presentEncyclopediaDetail } from './encyclopedia-detail-presenter.util';

const INITIAL_POKEMON_VISIBLE = 36;

@Component({
  selector: 'pv-encyclopedia-detail-panel',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './encyclopedia-detail-panel.component.html',
  styleUrl: './encyclopedia-detail-panel.component.scss',
})
export class EncyclopediaDetailPanelComponent {
  readonly detailState = input.required<AsyncState<EncyclopediaDetailPayload>>();
  readonly embedded = input<boolean>(false);
  readonly retry = output<void>();
  readonly pokemonSelected = output<string>();
  readonly navigateRelated = output<{
    readonly category: EncyclopediaResourceKey;
    readonly name: string;
  }>();

  readonly showAllPokemon = signal(false);
  readonly badgeTypeSlug = extractPokemonTypeFromBadge;

  constructor() {
    effect(() => {
      this.detailState();
      this.showAllPokemon.set(false);
    });
  }

  readonly presented = computed(() => {
    const state = this.detailState();
    return state.status === 'success' ? presentEncyclopediaDetail(state.data) : null;
  });

  readonly visibleReversePokemon = computed(() => {
    const detail = this.presented();
    if (!detail) return [];
    return this.showAllPokemon()
      ? detail.reversePokemon
      : detail.reversePokemon.slice(0, INITIAL_POKEMON_VISIBLE);
  });

  readonly remainingPokemonCount = computed(() => {
    const detail = this.presented();
    if (!detail) return 0;
    return Math.max(0, detail.reversePokemon.length - this.visibleReversePokemon().length);
  });
}
