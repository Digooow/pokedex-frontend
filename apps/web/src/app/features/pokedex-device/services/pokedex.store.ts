import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import {
  type AsyncState,
  CachedCatalogResponseSchema,
  CachedPokemonResponseSchema,
  MAX_CATALOG_RESULTS,
  PokeApiCatalogResponseSchema,
  type PokemonDetailDto,
  PokemonDetailSchema,
  type SearchablePokemonItem,
  buildSearchableCatalogItem,
  extractPokemonIdFromUrl,
  filterPokemonCatalog,
  formatPokeApiText,
} from '@pokeverse/shared';
import { Subscription, catchError, map, of, switchMap } from 'rxjs';

const API_CATALOG_URL = '/api/v1/pokedex/catalog';
const API_POKEMON_BASE = '/api/v1/pokedex/pokemon/';
const POKEAPI_CATALOG_URL = 'https://pokeapi.co/api/v2/pokemon?limit=100000&offset=0';
const POKEAPI_DETAIL_BASE = 'https://pokeapi.co/api/v2/pokemon/';

export interface PokemonDetailView {
  readonly id: number;
  readonly paddedId: string;
  readonly displayName: string;
  readonly spriteUrl: string | null;
  readonly fallbackSpriteUrl: string | null;
  readonly heightMeters: string;
  readonly weightKg: string;
  readonly types: readonly string[];
  readonly abilities: readonly string[];
  readonly stats: readonly { readonly label: string; readonly value: number }[];
}

export type ScenarioId = 'hoenn' | 'cidade' | 'vila' | 'floresta';

@Injectable({ providedIn: 'root' })
export class PokedexStore implements OnDestroy {
  private readonly http = inject(HttpClient);
  private catalogSub: Subscription | null = null;
  private detailSub: Subscription | null = null;

  private readonly catalogStateSignal = signal<AsyncState<readonly SearchablePokemonItem[]>>({
    status: 'idle',
  });
  private readonly detailStateSignal = signal<AsyncState<PokemonDetailView>>({
    status: 'empty',
    reason: 'Nenhum Pokémon selecionado no visor.',
  });
  private readonly querySignal = signal('');
  private readonly coverOpenSignal = signal(true);
  private readonly scenarioSignal = signal<ScenarioId>('hoenn');
  private readonly selectedIdSignal = signal<number | null>(null);
  private readonly cacheSourceSignal = signal<'hit' | 'miss' | 'direct' | null>(null);

  readonly catalogState = this.catalogStateSignal.asReadonly();
  readonly detailState = this.detailStateSignal.asReadonly();
  readonly query = this.querySignal.asReadonly();
  readonly coverOpen = this.coverOpenSignal.asReadonly();
  readonly scenario = this.scenarioSignal.asReadonly();
  readonly selectedId = this.selectedIdSignal.asReadonly();
  readonly cacheSource = this.cacheSourceSignal.asReadonly();

  readonly selectedPokemon = computed<PokemonDetailView | null>(() => {
    const state = this.detailStateSignal();
    return state.status === 'success' ? state.data : null;
  });

  readonly filteredCatalog = computed(() => {
    const state = this.catalogStateSignal();
    const list = state.status === 'success' ? state.data : [];
    return filterPokemonCatalog(list, this.querySignal(), MAX_CATALOG_RESULTS);
  });

  readonly suggestions = computed(() => {
    const q = this.querySignal().trim();
    const state = this.catalogStateSignal();
    if (!q || state.status !== 'success') {
      return [] as readonly SearchablePokemonItem[];
    }
    return filterPokemonCatalog(state.data, q, 4).items;
  });

  ensureCatalogLoaded(): void {
    const current = this.catalogStateSignal().status;
    if (current === 'loading' || current === 'success') {
      return;
    }

    this.catalogSub?.unsubscribe();
    this.catalogStateSignal.set({ status: 'loading' });

    this.catalogSub = this.http
      .get<unknown>(API_CATALOG_URL)
      .pipe(
        map((raw) => {
          const cached = CachedCatalogResponseSchema.safeParse(raw);
          return cached.success ? cached.data.catalog : null;
        }),
        catchError(() =>
          this.http.get<unknown>(POKEAPI_CATALOG_URL).pipe(
            map((directRaw) => {
              const direct = PokeApiCatalogResponseSchema.safeParse(directRaw);
              return direct.success ? direct.data : null;
            }),
            catchError(() => of(null)),
          ),
        ),
      )
      .subscribe((catalog) => {
        if (!catalog) {
          this.catalogStateSignal.set({
            status: 'error',
            error: {
              code: 'CATALOG_FETCH_FAILED',
              message: 'Não foi possível carregar o catálogo da PokéAPI agora.',
              retryable: true,
            },
          });
          return;
        }

        const items = catalog.results
          .map((entry) => buildSearchableCatalogItem(extractPokemonIdFromUrl(entry.url), entry.name))
          .filter((item) => item.id > 0);

        if (items.length === 0) {
          this.catalogStateSignal.set({
            status: 'empty',
            reason: 'Catálogo retornado vazio pela PokéAPI.',
          });
          return;
        }

        this.catalogStateSignal.set({ status: 'success', data: items });
      });
  }

  setQuery(rawQuery: string): void {
    this.querySignal.set(rawQuery);
  }

  setCoverOpen(open: boolean): void {
    this.coverOpenSignal.set(open);
  }

  setScenario(scenario: ScenarioId): void {
    this.scenarioSignal.set(scenario);
  }

  searchOrSelect(rawTerm: string): void {
    const cleaned = rawTerm.trim();
    if (!cleaned) {
      return;
    }
    this.querySignal.set(cleaned);

    const bestMatch = this.filteredCatalog().items[0];
    const target = bestMatch ? String(bestMatch.id) : cleaned.toLowerCase().replaceAll(/\s+/g, '-');
    this.loadPokemonDetail(target);
  }

  loadPokemonDetail(idOrName: string | number): void {
    this.detailSub?.unsubscribe();
    this.detailStateSignal.set({ status: 'loading' });

    const normalized = encodeURIComponent(String(idOrName).trim().toLowerCase());
    this.detailSub = this.http
      .get<unknown>(`${API_POKEMON_BASE}${normalized}`)
      .pipe(
        map((raw) => {
          const parsed = CachedPokemonResponseSchema.safeParse(raw);
          if (!parsed.success) {
            return null;
          }
          return {
            source: parsed.data.cache === 'hit' ? ('hit' as const) : ('miss' as const),
            dto: parsed.data.pokemon,
          };
        }),
        catchError((err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === 404) {
            return of(null);
          }
          return of('fallback-direct' as const);
        }),
        switchMap((firstTry) => {
          if (firstTry !== 'fallback-direct') {
            return of(firstTry);
          }
          return this.http.get<unknown>(`${POKEAPI_DETAIL_BASE}${normalized}`).pipe(
            map((raw) => {
              const direct = PokemonDetailSchema.safeParse(raw);
              return direct.success ? { source: 'direct' as const, dto: direct.data } : null;
            }),
            catchError(() => of(null)),
          );
        }),
      )
      .subscribe((resolved) => {
        if (!resolved) {
          this.selectedIdSignal.set(null);
          this.cacheSourceSignal.set(null);
          this.detailStateSignal.set({
            status: 'error',
            error: {
              code: 'POKEMON_NOT_FOUND',
              message: `Não foi possível encontrar "${String(idOrName)}" na PokéAPI.`,
              retryable: true,
            },
          });
          return;
        }

        const vm = this.toViewModel(resolved.dto);
        this.selectedIdSignal.set(vm.id);
        this.cacheSourceSignal.set(resolved.source);
        this.detailStateSignal.set({ status: 'success', data: vm });
      });
  }

  ngOnDestroy(): void {
    this.catalogSub?.unsubscribe();
    this.detailSub?.unsubscribe();
  }

  private toViewModel(dto: PokemonDetailDto): PokemonDetailView {
    const artwork = dto.sprites.other?.['official-artwork']?.front_default ?? null;
    const defaultSprite = dto.sprites.front_default ?? null;

    return {
      id: dto.id,
      paddedId: `#${String(dto.id).padStart(4, '0')}`,
      displayName: formatPokeApiText(dto.name),
      spriteUrl: artwork ?? defaultSprite,
      fallbackSpriteUrl: defaultSprite,
      heightMeters: `${(dto.height / 10).toFixed(1)} m`,
      weightKg: `${(dto.weight / 10).toFixed(1)} kg`,
      types: dto.types.map((slot) => formatPokeApiText(slot.type.name)),
      abilities: dto.abilities.map((slot) =>
        slot.is_hidden
          ? `${formatPokeApiText(slot.ability.name)} (Oculta)`
          : formatPokeApiText(slot.ability.name),
      ),
      stats: dto.stats.map((entry) => ({
        label: formatPokeApiText(entry.stat.name),
        value: entry.base_stat,
      })),
    };
  }
}
