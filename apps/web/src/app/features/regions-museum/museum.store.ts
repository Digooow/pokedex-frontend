import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import type { AsyncState } from '@pokeverse/shared';
import type { PokedexDetail, RegionDetail } from '@pokeverse/shared/pokedex-encyclopedia';
import { Subscription } from 'rxjs';
import { REGIONS_ATLAS_PREVIEW } from '../../shared/data/regions-atlas.data';
import { EncyclopediaApiClient } from '../encyclopedia/encyclopedia-api.client';

const PAGE_STEP = 12;

@Injectable({ providedIn: 'root' })
export class MuseumStore implements OnDestroy {
  private readonly api = inject(EncyclopediaApiClient);
  private readonly regionCache = new Map<string, RegionDetail>();
  private readonly pokedexCache = new Map<string, PokedexDetail>();
  private regionSub: Subscription | null = null;
  private pokedexSub: Subscription | null = null;

  readonly selectedRegionId = signal<string>(REGIONS_ATLAS_PREVIEW[0]?.id ?? 'kanto');
  readonly regionDetailState = signal<AsyncState<RegionDetail>>({ status: 'idle' });
  readonly selectedPokedexName = signal<string | null>(null);
  readonly pokedexDetailState = signal<AsyncState<PokedexDetail>>({ status: 'idle' });
  readonly locationQuery = signal('');
  readonly visibleEntriesCount = signal(PAGE_STEP);

  readonly selectedRegionMeta = computed(
    () =>
      REGIONS_ATLAS_PREVIEW.find((item) => item.id === this.selectedRegionId()) ??
      REGIONS_ATLAS_PREVIEW[0]!,
  );

  readonly filteredLocations = computed(() => {
    const state = this.regionDetailState();
    if (state.status !== 'success') return [];
    const term = this.locationQuery().trim().toLowerCase();
    const list = state.data.locations;
    if (!term) return list.slice(0, 24);
    return list.filter((loc) => loc.name.includes(term)).slice(0, 24);
  });

  readonly visiblePokedexEntries = computed(() => {
    const state = this.pokedexDetailState();
    if (state.status !== 'success') return [];
    return state.data.entries.slice(0, this.visibleEntriesCount());
  });

  selectRegion(regionId: string, force = false): void {
    const normalized = regionId.trim().toLowerCase();
    const matched = REGIONS_ATLAS_PREVIEW.find((item) => item.id === normalized);
    const targetId = matched?.id ?? this.selectedRegionId();
    this.selectedRegionId.set(targetId);
    this.locationQuery.set('');
    this.visibleEntriesCount.set(PAGE_STEP);

    const cached = !force ? this.regionCache.get(targetId) : undefined;
    if (cached) {
      this.applyRegionSuccess(cached);
      return;
    }

    this.regionSub?.unsubscribe();
    this.pokedexSub?.unsubscribe();
    this.regionDetailState.set({ status: 'loading' });
    this.pokedexDetailState.set({ status: 'loading' });

    this.regionSub = this.api.fetchDetail('region', targetId).subscribe((payload) => {
      if (this.selectedRegionId() !== targetId) return;
      if (!payload || payload.kind !== 'region') {
        this.regionDetailState.set({
          status: 'error',
          error: {
            code: 'MUSEUM_REGION_FAILED',
            message: 'Não foi possível carregar os dados vivos desta região.',
            retryable: true,
          },
        });
        this.pokedexDetailState.set({
          status: 'empty',
          reason: 'Pokédex regional indisponível enquanto a região não responder.',
        });
        return;
      }
      this.regionCache.set(targetId, payload.data);
      this.applyRegionSuccess(payload.data);
    });
  }

  selectPokedex(pokedexName: string, force = false): void {
    const key = pokedexName.trim().toLowerCase();
    if (!key) return;
    this.selectedPokedexName.set(key);
    this.visibleEntriesCount.set(PAGE_STEP);

    const cached = !force ? this.pokedexCache.get(key) : undefined;
    if (cached) {
      this.pokedexDetailState.set(
        cached.entries.length > 0
          ? { status: 'success', data: cached }
          : { status: 'empty', reason: 'Nenhuma espécie listada nesta Pokédex regional.' },
      );
      return;
    }

    this.pokedexSub?.unsubscribe();
    this.pokedexDetailState.set({ status: 'loading' });
    this.pokedexSub = this.api.fetchDetail('pokedex', key).subscribe((payload) => {
      if (this.selectedPokedexName() !== key) return;
      if (!payload || payload.kind !== 'pokedex') {
        this.pokedexDetailState.set({
          status: 'error',
          error: {
            code: 'MUSEUM_POKEDEX_FAILED',
            message: 'Não foi possível carregar a Pokédex regional selecionada.',
            retryable: true,
          },
        });
        return;
      }
      this.pokedexCache.set(key, payload.data);
      this.pokedexDetailState.set(
        payload.data.entries.length > 0
          ? { status: 'success', data: payload.data }
          : { status: 'empty', reason: 'Nenhuma espécie listada nesta Pokédex regional.' },
      );
    });
  }

  setLocationQuery(term: string): void {
    this.locationQuery.set(term);
  }

  showMoreEntries(): void {
    this.visibleEntriesCount.update((prev) => prev + PAGE_STEP);
  }

  retryRegion(): void {
    this.selectRegion(this.selectedRegionId(), true);
  }

  retryPokedex(): void {
    const current = this.selectedPokedexName();
    if (current) {
      this.selectPokedex(current, true);
    }
  }

  ngOnDestroy(): void {
    this.regionSub?.unsubscribe();
    this.pokedexSub?.unsubscribe();
  }

  private applyRegionSuccess(region: RegionDetail): void {
    this.regionDetailState.set({ status: 'success', data: region });
    const firstPokedex = region.pokedexes[0]?.name ?? null;
    if (!firstPokedex) {
      this.selectedPokedexName.set(null);
      this.pokedexDetailState.set({
        status: 'empty',
        reason: 'Esta região não possui Pokédex regional vinculada.',
      });
      return;
    }
    this.selectPokedex(firstPokedex);
  }
}
