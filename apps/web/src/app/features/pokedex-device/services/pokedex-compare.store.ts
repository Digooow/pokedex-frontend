import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { type AsyncState, normalizePokemonName } from '@pokeverse/shared';
import { Subscription } from 'rxjs';
import { PokedexApiClient } from './pokedex-api.client';
import { buildCompareStatRows, buildDefenseHighlights } from './pokedex-compare.util';
import { type PokemonDetailView, mapResolvedResultToAsyncState } from './pokedex-view-mapper.util';

export type CompareSide = 'left' | 'right';

@Injectable({ providedIn: 'root' })
export class PokedexCompareStore implements OnDestroy {
  private readonly apiClient = inject(PokedexApiClient);
  private leftSub: Subscription | null = null;
  private rightSub: Subscription | null = null;
  private lastLeftTerm = '';
  private lastRightTerm = '';

  readonly dialogOpen = signal(false);
  readonly leftState = signal<AsyncState<PokemonDetailView>>({
    status: 'empty',
    reason: 'Escolha o 1º Pokémon para comparar.',
  });
  readonly rightState = signal<AsyncState<PokemonDetailView>>({
    status: 'empty',
    reason: 'Escolha o 2º Pokémon para comparar.',
  });

  readonly statRows = computed(() => {
    const left = this.leftState();
    const right = this.rightState();
    if (left.status !== 'success' || right.status !== 'success') return [];
    return buildCompareStatRows(left.data, right.data);
  });

  readonly leftDefense = computed(() => {
    const left = this.leftState();
    return left.status === 'success' ? buildDefenseHighlights(left.data) : null;
  });

  readonly rightDefense = computed(() => {
    const right = this.rightState();
    return right.status === 'success' ? buildDefenseHighlights(right.data) : null;
  });

  openWithPokemon(pokemon: PokemonDetailView): void {
    this.lastLeftTerm = pokemon.name;
    this.leftState.set({ status: 'success', data: pokemon });
    this.dialogOpen.set(true);
  }

  close(): void {
    this.dialogOpen.set(false);
  }

  selectSide(side: CompareSide, idOrName: string): void {
    const rawStr = idOrName.trim();
    const normalized = normalizePokemonName(rawStr);
    if (!normalized) return;

    if (side === 'left') {
      this.lastLeftTerm = rawStr;
      this.leftSub?.unsubscribe();
      this.leftState.set({ status: 'loading' });
      this.leftSub = this.fetchSide(normalized, (state) => this.leftState.set(state), rawStr);
      return;
    }

    this.lastRightTerm = rawStr;
    this.rightSub?.unsubscribe();
    this.rightState.set({ status: 'loading' });
    this.rightSub = this.fetchSide(normalized, (state) => this.rightState.set(state), rawStr);
  }

  retrySide(side: CompareSide): void {
    const term = side === 'left' ? this.lastLeftTerm : this.lastRightTerm;
    if (term) this.selectSide(side, term);
  }

  swapSides(): void {
    const prevLeft = this.leftState();
    const prevRight = this.rightState();
    const prevLeftTerm = this.lastLeftTerm;
    this.lastLeftTerm = this.lastRightTerm;
    this.lastRightTerm = prevLeftTerm;
    this.leftState.set(prevRight);
    this.rightState.set(prevLeft);
  }

  ngOnDestroy(): void {
    this.leftSub?.unsubscribe();
    this.rightSub?.unsubscribe();
  }

  private fetchSide(
    normalized: string,
    applyState: (state: AsyncState<PokemonDetailView>) => void,
    rawStr: string,
  ): Subscription {
    return this.apiClient.fetchPokemonBundle(normalized).subscribe((resolved) => {
      applyState(mapResolvedResultToAsyncState(resolved, rawStr));
    });
  }
}
