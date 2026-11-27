import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import {
  type AsyncState,
  type EnrichedCatalogItem,
  type PokemonTypeName,
  normalizePokemonName,
} from '@pokeverse/shared';
import {
  type PokedexMetaFilters,
  hydrateEnrichedCatalog,
} from '@pokeverse/shared/pokedex-encyclopedia';
import { Subscription, forkJoin } from 'rxjs';
import { PokedexApiClient } from './pokedex-api.client';
import {
  PokedexAttributeLookupService,
  buildAttributeLookupRequests,
} from './pokedex-attribute-lookup.service';
import {
  type DetectedAttributeShortcut,
  buildActiveFilterChips,
  countActiveFilters,
  createFilterErrorState,
} from './pokedex-attribute-search.util';

export type CatalogSortOption = 'id-asc' | 'id-desc' | 'name-asc' | 'bst-desc';
export type FilterFlagKey = 'onlyLegendary' | 'onlyMythical' | 'onlyBaby' | 'excludeAlternateForms';

@Injectable({ providedIn: 'root' })
export class PokedexFiltersStore implements OnDestroy {
  private readonly apiClient = inject(PokedexApiClient);
  private readonly lookupService = inject(PokedexAttributeLookupService);
  private loadSub: Subscription | null = null;
  private remoteSub: Subscription | null = null;

  readonly panelOpen = signal(false);
  readonly types = signal<readonly PokemonTypeName[]>([]);
  readonly generation = signal<number | null>(null);
  readonly region = signal<string | null>(null);
  readonly game = signal<string | null>(null);
  readonly eggGroup = signal<string | null>(null);
  readonly moveFilter = signal<string | null>(null);
  readonly abilityFilter = signal<string | null>(null);
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
  readonly remoteAllowedState = signal<AsyncState<ReadonlySet<string> | null>>({ status: 'idle' });
  readonly degradedCatalog = signal(false);

  readonly hasEnrichedEggGroups = computed(() => {
    const enriched = this.enrichedState();
    return (
      enriched.status === 'success' && enriched.data.some((item) => Boolean(item.eggGroups?.length))
    );
  });

  readonly hasRemoteLookupActive = computed(
    () =>
      Boolean(this.moveFilter()) ||
      Boolean(this.abilityFilter()) ||
      Boolean(this.game()) ||
      Boolean(this.eggGroup() && !this.hasEnrichedEggGroups()),
  );

  readonly activeFilterCount = computed(() => countActiveFilters(this.filterSnapshot()));

  readonly hasActiveFilters = computed(
    () => this.activeFilterCount() > 0 || this.sortBy() !== 'id-asc',
  );

  readonly activeFilterChips = computed(() => buildActiveFilterChips(this.filterSnapshot()));

  togglePanel(): void {
    const next = !this.panelOpen();
    this.panelOpen.set(next);
    if (next) this.ensureLoaded();
  }

  closePanel = () => this.panelOpen.set(false);
  retryRemoteLookups = () => this.syncRemoteLookups();

  ensureLoaded(force = false): void {
    const enrichedStatus = this.enrichedState().status;
    if (!force && (enrichedStatus === 'loading' || enrichedStatus === 'success')) return;
    this.loadSub?.unsubscribe();
    this.enrichedState.set({ status: 'loading' });
    this.metaState.set({ status: 'loading' });

    this.loadSub = forkJoin({
      enriched: this.apiClient.fetchEnrichedCatalog(),
      meta: this.apiClient.fetchMetaFilters(),
    }).subscribe(({ enriched, meta }) => {
      if (!enriched) {
        this.degradedCatalog.set(false);
        this.enrichedState.set(
          createFilterErrorState(
            'ENRICHED_CATALOG_UNAVAILABLE',
            'Não foi possível carregar os filtros avançados agora.',
          ),
        );
      } else {
        this.degradedCatalog.set(enriched.degraded);
        this.enrichedState.set({ status: 'success', data: hydrateEnrichedCatalog(enriched.items) });
        this.syncRemoteLookups();
      }
      this.metaState.set(
        meta
          ? { status: 'success', data: meta.filters }
          : createFilterErrorState(
              'META_FILTERS_UNAVAILABLE',
              'Metadados de filtro indisponíveis.',
            ),
      );
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

  setRegion(value: string | null): void {
    this.ensureLoaded();
    this.region.set(value?.trim().toLowerCase() || null);
  }

  setGame(value: string | null): void {
    this.ensureLoaded();
    this.game.set(value?.trim().toLowerCase() || null);
    this.syncRemoteLookups();
  }

  setEggGroup(value: string | null): void {
    this.ensureLoaded();
    this.eggGroup.set(value?.trim().toLowerCase() || null);
    this.syncRemoteLookups();
  }

  setMoveFilter(value: string | null): void {
    this.ensureLoaded();
    this.moveFilter.set((value ? normalizePokemonName(value) : '') || null);
    this.syncRemoteLookups();
  }

  setAbilityFilter(value: string | null): void {
    this.ensureLoaded();
    this.abilityFilter.set((value ? normalizePokemonName(value) : '') || null);
    this.syncRemoteLookups();
  }

  applyAttributeShortcut(shortcut: DetectedAttributeShortcut): void {
    if (shortcut.kind === 'type') {
      this.types.set([shortcut.value as PokemonTypeName]);
      this.ensureLoaded();
      return;
    }
    if (shortcut.kind === 'region') return this.setRegion(shortcut.value);
    if (shortcut.kind === 'habitat') return this.setHabitat(shortcut.value);
    if (shortcut.kind === 'eggGroup') return this.setEggGroup(shortcut.value);
    this.setGame(shortcut.value);
  }

  removeFilterByKey(chipKey: string): void {
    if (chipKey.startsWith('type:')) {
      const slug = chipKey.slice('type:'.length);
      const match = this.types().find((item) => item === slug);
      if (match) this.toggleType(match);
      return;
    }
    const clearByKey: Readonly<Record<string, () => void>> = {
      region: () => this.setRegion(null),
      game: () => this.setGame(null),
      eggGroup: () => this.setEggGroup(null),
      move: () => this.setMoveFilter(null),
      ability: () => this.setAbilityFilter(null),
      habitat: () => this.setHabitat(null),
    };
    clearByKey[chipKey]?.();
  }

  setHabitat = (value: string | null) => {
    this.ensureLoaded();
    this.habitat.set(value || null);
  };

  setColor = (value: string | null) => {
    this.ensureLoaded();
    this.color.set(value || null);
  };

  setShape = (value: string | null) => {
    this.ensureLoaded();
    this.shape.set(value || null);
  };

  toggleFlag(flag: FilterFlagKey): void {
    this.ensureLoaded();
    const flagMap = {
      onlyLegendary: this.onlyLegendary,
      onlyMythical: this.onlyMythical,
      onlyBaby: this.onlyBaby,
      excludeAlternateForms: this.excludeAlternateForms,
    } as const;
    flagMap[flag].update((prev) => !prev);
  }

  setMinBst(rawValue: number): void {
    this.ensureLoaded();
    this.minBst.set(
      Number.isFinite(rawValue) ? Math.max(0, Math.min(1200, Math.trunc(rawValue))) : 0,
    );
  }

  setSortBy(sort: CatalogSortOption): void {
    this.ensureLoaded();
    this.sortBy.set(sort);
  }

  resetFilters(): void {
    this.types.set([]);
    this.generation.set(null);
    this.region.set(null);
    this.game.set(null);
    this.eggGroup.set(null);
    this.moveFilter.set(null);
    this.abilityFilter.set(null);
    this.habitat.set(null);
    this.color.set(null);
    this.shape.set(null);
    this.onlyLegendary.set(false);
    this.onlyMythical.set(false);
    this.onlyBaby.set(false);
    this.excludeAlternateForms.set(false);
    this.minBst.set(0);
    this.sortBy.set('id-asc');
    this.syncRemoteLookups();
  }

  buildQueryPayload(term: string) {
    const snap = this.filterSnapshot();
    return {
      ...snap,
      term,
      eggGroup: this.hasEnrichedEggGroups() ? snap.eggGroup : null,
      sortBy: this.sortBy(),
      limit: 1500,
    };
  }

  private filterSnapshot() {
    return {
      types: [...this.types()],
      generation: this.generation(),
      region: this.region(),
      game: this.game(),
      eggGroup: this.eggGroup(),
      moveFilter: this.moveFilter(),
      abilityFilter: this.abilityFilter(),
      habitat: this.habitat(),
      color: this.color(),
      shape: this.shape(),
      onlyLegendary: this.onlyLegendary(),
      onlyMythical: this.onlyMythical(),
      onlyBaby: this.onlyBaby(),
      excludeAlternateForms: this.excludeAlternateForms(),
      minBst: this.minBst(),
    };
  }

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
    this.remoteSub?.unsubscribe();
  }

  private syncRemoteLookups(): void {
    const requests = buildAttributeLookupRequests({
      moveFilter: this.moveFilter(),
      abilityFilter: this.abilityFilter(),
      game: this.game(),
      eggGroup: this.eggGroup(),
      hasEnrichedEggGroups: this.hasEnrichedEggGroups(),
    });
    this.remoteSub?.unsubscribe();
    if (requests.length === 0) {
      this.remoteAllowedState.set({ status: 'idle' });
      return;
    }

    this.remoteAllowedState.set({ status: 'loading' });
    this.remoteSub = this.lookupService.resolveIntersection(requests).subscribe((allowedSet) => {
      this.remoteAllowedState.set(
        allowedSet
          ? { status: 'success', data: allowedSet }
          : createFilterErrorState(
              'ATTRIBUTE_LOOKUP_FAILED',
              'Não foi possível consultar este atributo agora.',
            ),
      );
    });
  }
}
