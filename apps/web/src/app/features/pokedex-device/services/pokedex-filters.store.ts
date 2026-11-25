import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import type { AsyncState, EnrichedCatalogItem, PokemonTypeName } from '@pokeverse/shared';
import type { PokedexMetaFilters } from '@pokeverse/shared/pokedex-encyclopedia';
import { Subscription, forkJoin } from 'rxjs';
import { PokedexApiClient } from './pokedex-api.client';
import { hydrateEnrichedCatalog } from '@pokeverse/shared/pokedex-encyclopedia';

export type CatalogSortOption = 'id-asc' | 'id-desc' | 'name-asc' | 'bst-desc';
export type FilterFlagKey = 'onlyLegendary' | 'onlyMythical' | 'onlyBaby' | 'excludeAlternateForms';

@Injectable({ providedIn: 'root' })
export class PokedexFiltersStore implements OnDestroy {
  private readonly apiClient = inject(PokedexApiClient);
  private loadSub: Subscription | null = null;

  readonly panelOpen = signal(false);
  readonly types = signal<readonly PokemonTypeName[]>([]);
  readonly generation = signal<number | null>(null);
  readonly habitat = signal<string | null>(null);
  readonly color = signal<string | null>(null);
  readonly shape = signal<string | null>(null);
  readonly onlyLegendary = signal(false);
  readonly onlyMythical = signal(false);
  readonly onlyBaby = signal(false);
  readonly excludeAlternateForms = signal(false);
  readonly minBst = signal(0);
  readonly sortBy = signal<CatalogSortOption>('id-asc');

  readonly enrichedState = signal<AsyncState<readonly EnrichedCatalogItem[]>>({ status: 'idle' });
  readonly metaState = signal<AsyncState<PokedexMetaFilters>>({ status: 'idle' });
  readonly degradedCatalog = signal(false);

  readonly activeFilterCount = computed(() => {
    let count = this.types().length;
    if (this.generation() !== null) count += 1;
    if (this.habitat() !== null) count += 1;
    if (this.color() !== null) count += 1;
    if (this.shape() !== null) count += 1;
    if (this.onlyLegendary()) count += 1;
    if (this.onlyMythical()) count += 1;
    if (this.onlyBaby()) count += 1;
    if (this.excludeAlternateForms()) count += 1;
    if (this.minBst() > 0) count += 1;
    return count;
  });

  readonly hasActiveFilters = computed(
    () => this.activeFilterCount() > 0 || this.sortBy() !== 'id-asc',
  );

  togglePanel(): void {
    const next = !this.panelOpen();
    this.panelOpen.set(next);
    if (next) this.ensureLoaded();
  }

  closePanel(): void {
    this.panelOpen.set(false);
  }

  ensureLoaded(force = false): void {
    const enrichedStatus = this.enrichedState().status;
    if (!force && (enrichedStatus === 'loading' || enrichedStatus === 'success')) {
      return;
    }

    this.loadSub?.unsubscribe();
    this.enrichedState.set({ status: 'loading' });
    this.metaState.set({ status: 'loading' });

    this.loadSub = forkJoin({
      enriched: this.apiClient.fetchEnrichedCatalog(),
      meta: this.apiClient.fetchMetaFilters(),
    }).subscribe(({ enriched, meta }) => {
      if (!enriched) {
        this.degradedCatalog.set(false);
        this.enrichedState.set({
          status: 'error',
          error: {
            code: 'ENRICHED_CATALOG_UNAVAILABLE',
            message: 'Não foi possível carregar os filtros avançados agora.',
            retryable: true,
          },
        });
      } else {
        this.degradedCatalog.set(enriched.degraded);
        this.enrichedState.set({
          status: 'success',
          data: hydrateEnrichedCatalog(enriched.items),
        });
      }

      if (!meta) {
        this.metaState.set({
          status: 'error',
          error: {
            code: 'META_FILTERS_UNAVAILABLE',
            message: 'Metadados de filtro indisponíveis.',
            retryable: true,
          },
        });
        return;
      }

      this.metaState.set({ status: 'success', data: meta.filters });
    });
  }

  toggleType(type: PokemonTypeName): void {
    this.ensureLoaded();
    this.types.update((prev) => {
      if (prev.includes(type)) return prev.filter((item) => item !== type);
      if (prev.length < 2) return [...prev, type];
      const second = prev[1];
      return second ? [second, type] : [type];
    });
  }

  setGeneration(generation: number | null): void {
    this.ensureLoaded();
    this.generation.set(generation);
  }

  setHabitat(value: string | null): void {
    this.ensureLoaded();
    this.habitat.set(value || null);
  }

  setColor(value: string | null): void {
    this.ensureLoaded();
    this.color.set(value || null);
  }

  setShape(value: string | null): void {
    this.ensureLoaded();
    this.shape.set(value || null);
  }

  toggleFlag(flag: FilterFlagKey): void {
    this.ensureLoaded();
    if (flag === 'onlyLegendary') this.onlyLegendary.update((prev) => !prev);
    else if (flag === 'onlyMythical') this.onlyMythical.update((prev) => !prev);
    else if (flag === 'onlyBaby') this.onlyBaby.update((prev) => !prev);
    else this.excludeAlternateForms.update((prev) => !prev);
  }

  setMinBst(rawValue: number): void {
    this.ensureLoaded();
    const clamped = Number.isFinite(rawValue)
      ? Math.max(0, Math.min(1200, Math.trunc(rawValue)))
      : 0;
    this.minBst.set(clamped);
  }

  setSortBy(sort: CatalogSortOption): void {
    this.ensureLoaded();
    this.sortBy.set(sort);
  }

  resetFilters(): void {
    this.types.set([]);
    this.generation.set(null);
    this.habitat.set(null);
    this.color.set(null);
    this.shape.set(null);
    this.onlyLegendary.set(false);
    this.onlyMythical.set(false);
    this.onlyBaby.set(false);
    this.excludeAlternateForms.set(false);
    this.minBst.set(0);
    this.sortBy.set('id-asc');
  }

  buildQueryPayload(term: string) {
    return {
      term,
      types: [...this.types()],
      generation: this.generation(),
      habitat: this.habitat(),
      color: this.color(),
      shape: this.shape(),
      onlyLegendary: this.onlyLegendary(),
      onlyMythical: this.onlyMythical(),
      onlyBaby: this.onlyBaby(),
      excludeAlternateForms: this.excludeAlternateForms(),
      minBst: this.minBst(),
      sortBy: this.sortBy(),
      limit: 1500,
    };
  }

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
  }
}
