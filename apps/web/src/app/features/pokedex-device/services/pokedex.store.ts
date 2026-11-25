import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import {
  type AsyncState,
  type SearchablePokemonItem,
  filterPokemonCatalog,
  normalizePokemonName,
} from '@pokeverse/shared';
import { Subscription, firstValueFrom } from 'rxjs';
import { type ScenarioId, ScenarioStore } from '../../../core/stores/scenario.store';
import { PokedexApiClient } from './pokedex-api.client';
import { PokedexFiltersStore } from './pokedex-filters.store';
import {
  type PokedexCacheSource,
  type PokemonDetailView,
  type ResolvedPokemonForSlot,
  buildAdvancedCatalogResult,
  buildPokemonFetchErrorMessage,
  mapCatalogEntriesToSearchable,
  mapResolvedPokemonToView,
  toResolvedPokemonForSlot,
} from './pokedex-view-mapper.util';

const CATALOG_BATCH_SIZE = 150;

export type { PokedexCacheSource, PokemonDetailView, ResolvedPokemonForSlot, ScenarioId };

@Injectable({ providedIn: 'root' })
export class PokedexStore implements OnDestroy {
  private readonly apiClient = inject(PokedexApiClient);
  private readonly filtersStore = inject(PokedexFiltersStore);
  private readonly scenarioStore = inject(ScenarioStore);
  private catalogSub: Subscription | null = null;
  private detailSub: Subscription | null = null;

  private readonly catalogStateSignal = signal<AsyncState<readonly SearchablePokemonItem[]>>({
    status: 'idle',
  });
  private readonly detailStateSignal = signal<AsyncState<PokemonDetailView>>({
    status: 'empty',
    reason: 'Pesquise um Pokémon no módulo de busca ao lado ou selecione um da lista.',
  });
  private readonly querySignal = signal('');
  private readonly previousQuerySignal = signal('');
  private readonly batchLimitSignal = signal(CATALOG_BATCH_SIZE);
  private readonly coverOpenSignal = signal(false);
  private readonly selectedIdSignal = signal<number | null>(null);
  private readonly lastSearchedTermSignal = signal('');
  private readonly cacheSourceSignal = signal<PokedexCacheSource | null>(null);

  readonly catalogState = this.catalogStateSignal.asReadonly();
  readonly detailState = this.detailStateSignal.asReadonly();
  readonly query = this.querySignal.asReadonly();
  readonly previousQuery = this.previousQuerySignal.asReadonly();
  readonly batchLimit = this.batchLimitSignal.asReadonly();
  readonly coverOpen = this.coverOpenSignal.asReadonly();
  readonly scenario = this.scenarioStore.activeScenario;
  readonly selectedId = this.selectedIdSignal.asReadonly();
  readonly lastSearchedTerm = this.lastSearchedTermSignal.asReadonly();
  readonly cacheSource = this.cacheSourceSignal.asReadonly();

  readonly selectedPokemon = computed<PokemonDetailView | null>(() => {
    const state = this.detailStateSignal();
    return state.status === 'success' ? state.data : null;
  });

  private readonly advancedCatalogView = computed(() => {
    if (!this.filtersStore.hasActiveFilters()) {
      return null;
    }
    const enriched = this.filtersStore.enrichedState();
    if (enriched.status !== 'success') {
      return { totalMatches: 0, result: { mode: 'exact' as const, items: [] } };
    }
    return buildAdvancedCatalogResult(
      enriched.data,
      this.filtersStore.buildQueryPayload(this.querySignal()),
      Boolean(this.querySignal().trim()),
      this.batchLimitSignal(),
    );
  });

  readonly catalogTotalCount = computed<number>(() => {
    const adv = this.advancedCatalogView();
    if (adv) return adv.totalMatches;
    const state = this.catalogStateSignal();
    return state.status === 'success' ? state.data.length : 0;
  });

  readonly filteredCatalog = computed(() => {
    const adv = this.advancedCatalogView();
    if (adv) return adv.result;
    const state = this.catalogStateSignal();
    const list = state.status === 'success' ? state.data : [];
    const maxResults = this.querySignal().trim() ? undefined : this.batchLimitSignal();
    return filterPokemonCatalog(list, this.querySignal(), maxResults);
  });

  readonly hasMoreCatalog = computed(() => {
    if (this.querySignal().trim()) {
      return false;
    }
    return this.filteredCatalog().items.length < this.catalogTotalCount();
  });

  readonly suggestions = computed(() => {
    const state = this.catalogStateSignal();
    const q = this.lastSearchedTermSignal().trim() || this.querySignal().trim();
    if (!q || state.status !== 'success') {
      return [] as readonly SearchablePokemonItem[];
    }
    return filterPokemonCatalog(state.data, q, 4).items;
  });

  ensureCatalogLoaded(force = false): void {
    const current = this.catalogStateSignal().status;
    if (!force && (current === 'loading' || current === 'success')) {
      return;
    }

    this.catalogSub?.unsubscribe();
    this.catalogStateSignal.set({ status: 'loading' });

    this.catalogSub = this.apiClient.fetchCatalog().subscribe((catalog) => {
      if (!catalog) {
        this.catalogStateSignal.set({
          status: 'error',
          error: {
            code: 'CATALOG_UNAVAILABLE',
            message: 'Não foi possível carregar a lista completa agora.',
            retryable: true,
          },
        });
        return;
      }

      const items = mapCatalogEntriesToSearchable(catalog);
      if (items.length === 0) {
        this.catalogStateSignal.set({
          status: 'empty',
          reason: 'Lista vazia no catálogo PokéAPI.',
        });
        return;
      }

      this.catalogStateSignal.set({ status: 'success', data: items });
    });
  }

  setQuery(rawQuery: string): void {
    this.querySignal.set(rawQuery);
    this.batchLimitSignal.set(CATALOG_BATCH_SIZE);
  }

  setUserQuery(rawQuery: string): void {
    this.previousQuerySignal.set('');
    this.setQuery(rawQuery);
  }

  selectFromCatalog(pokemonName: string): void {
    const current = this.querySignal().trim();
    const target = pokemonName.trim();
    if (
      current &&
      current.toLowerCase() !== target.toLowerCase() &&
      this.filteredCatalog().items.length > 1
    ) {
      this.previousQuerySignal.set(current);
    }
    this.setQuery(pokemonName);
    this.loadPokemonDetail(pokemonName);
  }

  consumePreviousQuery(): string {
    const prev = this.previousQuerySignal();
    this.previousQuerySignal.set('');
    return prev;
  }

  findCatalogIndex(pokemonNameOrId: string | number | null): number {
    if (pokemonNameOrId === null || pokemonNameOrId === undefined) {
      return -1;
    }
    const target = String(pokemonNameOrId).trim().toLowerCase();
    if (!target) {
      return -1;
    }
    const numericId = Number.parseInt(target.replace(/^#/, ''), 10);
    if (this.querySignal().trim() || this.filtersStore.hasActiveFilters()) {
      const filtered = this.filteredCatalog().items;
      return filtered.findIndex(
        (item) =>
          item.name.toLowerCase() === target || (!Number.isNaN(numericId) && item.id === numericId),
      );
    }
    const state = this.catalogStateSignal();
    if (state.status !== 'success') {
      return -1;
    }
    return state.data.findIndex(
      (item) =>
        item.name.toLowerCase() === target || (!Number.isNaN(numericId) && item.id === numericId),
    );
  }

  loadMoreCatalog(): void {
    const total = this.catalogTotalCount();
    this.batchLimitSignal.update((current) =>
      Math.min(total || current + CATALOG_BATCH_SIZE, current + CATALOG_BATCH_SIZE),
    );
  }

  ensureCatalogIndexVisible(index: number): void {
    if (index < 0 || this.querySignal().trim()) {
      return;
    }
    const needed = index + CATALOG_BATCH_SIZE;
    const total = this.catalogTotalCount();
    const targetLimit = total > 0 ? Math.min(total, needed) : needed;
    if (targetLimit > this.batchLimitSignal()) {
      this.batchLimitSignal.set(targetLimit);
    }
  }

  setCoverOpen(open: boolean): void {
    this.coverOpenSignal.set(open);
  }

  setScenario(scenario: ScenarioId): void {
    this.scenarioStore.selectScenario(scenario, false);
  }

  clearQuery(): void {
    this.previousQuerySignal.set('');
    this.querySignal.set('');
    this.batchLimitSignal.set(CATALOG_BATCH_SIZE);
  }

  clearResult(): void {
    this.detailSub?.unsubscribe();
    this.detailSub = null;
    this.selectedIdSignal.set(null);
    this.cacheSourceSignal.set(null);
    this.lastSearchedTermSignal.set('');
    this.detailStateSignal.set({
      status: 'empty',
      reason: 'Visor limpo. Pesquise ou selecione um Pokémon para visualizar.',
    });
  }

  searchOrSelect(rawTerm: string): void {
    const trimmed = rawTerm.trim();
    if (!trimmed) {
      return;
    }
    this.setQuery(trimmed);
    this.loadPokemonDetail(trimmed);
  }

  retryLastSearch(): void {
    const target = this.lastSearchedTermSignal().trim() || this.querySignal().trim();
    if (target) {
      this.loadPokemonDetail(target);
    }
  }

  loadPokemonDetail(idOrName: string | number): void {
    const rawStr = String(idOrName).trim();
    const normalized = normalizePokemonName(rawStr);
    if (!normalized) {
      return;
    }

    this.lastSearchedTermSignal.set(rawStr);
    this.detailSub?.unsubscribe();
    this.detailStateSignal.set({ status: 'loading' });

    this.detailSub = this.apiClient.fetchPokemonBundle(normalized).subscribe((resolved) => {
      if (!resolved.found) {
        this.cacheSourceSignal.set(null);
        this.selectedIdSignal.set(null);
        this.detailStateSignal.set({
          status: 'error',
          error: {
            code: resolved.notFound ? 'POKEMON_NOT_FOUND' : 'POKEMON_FETCH_FAILED',
            message: buildPokemonFetchErrorMessage(rawStr, resolved),
            retryable: !resolved.notFound,
          },
        });
        return;
      }

      const vm = mapResolvedPokemonToView(resolved);
      if (!vm) {
        this.cacheSourceSignal.set(null);
        this.selectedIdSignal.set(null);
        this.detailStateSignal.set({
          status: 'error',
          error: {
            code: 'POKEMON_FETCH_FAILED',
            message: 'Resposta inválida ao carregar os dados do Pokémon.',
            retryable: true,
          },
        });
        return;
      }
      this.selectedIdSignal.set(vm.id);
      this.cacheSourceSignal.set(resolved.source);
      this.detailStateSignal.set({ status: 'success', data: vm });
    });
  }

  async resolvePokemonForSlot(idOrName: string): Promise<ResolvedPokemonForSlot | null> {
    const normalized = normalizePokemonName(idOrName);
    if (!normalized) {
      return null;
    }
    const resolved = await firstValueFrom(this.apiClient.fetchPokemonDto(normalized));
    return resolved.found && resolved.dto ? toResolvedPokemonForSlot(resolved.dto) : null;
  }

  ngOnDestroy(): void {
    this.catalogSub?.unsubscribe();
    this.detailSub?.unsubscribe();
  }
}
