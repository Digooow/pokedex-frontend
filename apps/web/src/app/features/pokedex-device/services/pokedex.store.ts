import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import {
  type AsyncState,
  CachedCatalogResponseSchema,
  CachedPokemonResponseSchema,
  PokeApiCatalogResponseSchema,
  type PokemonDetailDto,
  PokemonDetailSchema,
  type SearchablePokemonItem,
  buildSearchableCatalogItem,
  extractPokemonIdFromUrl,
  filterPokemonCatalog,
  formatPokeApiText,
  normalizePokemonName,
} from '@pokeverse/shared';
import { Subscription, catchError, firstValueFrom, map, of, switchMap, timeout } from 'rxjs';
import { type ScenarioId, ScenarioStore } from '../../../core/stores/scenario.store';

const API_CATALOG_URL = '/api/v1/pokedex/catalog';
const API_POKEMON_BASE = '/api/v1/pokedex/pokemon/';
const POKEAPI_CATALOG_URL = 'https://pokeapi.co/api/v2/pokemon?limit=100000&offset=0';
const POKEAPI_DETAIL_BASE = 'https://pokeapi.co/api/v2/pokemon/';
const CATALOG_BATCH_SIZE = 150;
const REQUEST_TIMEOUT_MS = 10000;

export interface PokemonDetailView {
  readonly id: number;
  readonly name: string;
  readonly paddedId: string;
  readonly displayName: string;
  readonly spriteUrl: string | null;
  readonly fallbackSpriteUrl: string | null;
  readonly heightMeters: string;
  readonly weightKg: string;
  readonly heightRawDm: number;
  readonly weightRawHg: number;
  readonly types: readonly string[];
  readonly abilities: readonly string[];
  readonly stats: readonly { readonly label: string; readonly value: number }[];
}

export interface ResolvedPokemonForSlot {
  readonly id: number;
  readonly name: string;
  readonly displayName: string;
  readonly spriteUrl: string | null;
}

export type { ScenarioId };

type ResolvedPokemonResult =
  | { readonly found: true; readonly dto: PokemonDetailDto; readonly source: 'hit' | 'miss' | 'direct' }
  | { readonly found: false; readonly notFound: boolean; readonly statusCode: number | null };

@Injectable({ providedIn: 'root' })
export class PokedexStore implements OnDestroy {
  private readonly http = inject(HttpClient);
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
  private readonly batchLimitSignal = signal(CATALOG_BATCH_SIZE);
  private readonly coverOpenSignal = signal(false);
  private readonly selectedIdSignal = signal<number | null>(null);
  private readonly lastSearchedTermSignal = signal('');
  private readonly cacheSourceSignal = signal<'hit' | 'miss' | 'direct' | null>(null);

  readonly catalogState = this.catalogStateSignal.asReadonly();
  readonly detailState = this.detailStateSignal.asReadonly();
  readonly query = this.querySignal.asReadonly();
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

  readonly catalogTotalCount = computed<number>(() => {
    const state = this.catalogStateSignal();
    return state.status === 'success' ? state.data.length : 0;
  });

  readonly filteredCatalog = computed(() => {
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

    this.catalogSub = this.http
      .get<unknown>(API_CATALOG_URL)
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((raw) => {
          const cached = CachedCatalogResponseSchema.safeParse(raw);
          return cached.success ? cached.data.catalog : null;
        }),
        catchError(() =>
          this.http.get<unknown>(POKEAPI_CATALOG_URL).pipe(
            timeout(REQUEST_TIMEOUT_MS),
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
              code: 'CATALOG_UNAVAILABLE',
              message: 'Não foi possível carregar a lista completa agora.',
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

  loadMoreCatalog(): void {
    const total = this.catalogTotalCount();
    this.batchLimitSignal.update((current) => Math.min(total || current + CATALOG_BATCH_SIZE, current + CATALOG_BATCH_SIZE));
  }

  ensureCatalogIndexVisible(index: number): void {
    if (index < 0 || this.querySignal().trim()) {
      return;
    }
    const needed = index + CATALOG_BATCH_SIZE;
    if (needed > this.batchLimitSignal()) {
      const total = this.catalogTotalCount();
      this.batchLimitSignal.set(total > 0 ? Math.min(total, needed) : needed);
    }
  }

  setCoverOpen(open: boolean): void {
    this.coverOpenSignal.set(open);
  }

  setScenario(scenario: ScenarioId): void {
    this.scenarioStore.selectScenario(scenario, false);
  }

  clearQuery(): void {
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

    this.detailSub = this.fetchPokemonDto(normalized).subscribe((resolved) => {
      if (!resolved.found) {
        this.cacheSourceSignal.set(null);
        this.selectedIdSignal.set(null);
        const message = resolved.notFound
          ? `Não encontramos nenhum Pokémon com o nome "${rawStr}". Verifique a ortografia ou escolha uma sugestão.`
          : resolved.statusCode
            ? `Não foi possível concluir a comunicação com a PokéAPI no momento (código HTTP ${resolved.statusCode}).`
            : 'A PokéAPI não respondeu a tempo. Verifique sua conexão com a internet e tente novamente.';
        this.detailStateSignal.set({
          status: 'error',
          error: {
            code: resolved.notFound ? 'POKEMON_NOT_FOUND' : 'POKEMON_FETCH_FAILED',
            message,
            retryable: !resolved.notFound,
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

  async resolvePokemonForSlot(idOrName: string): Promise<ResolvedPokemonForSlot | null> {
    const normalized = normalizePokemonName(idOrName);
    if (!normalized) {
      return null;
    }
    const resolved = await firstValueFrom(this.fetchPokemonDto(normalized));
    if (!resolved.found) {
      return null;
    }
    const vm = this.toViewModel(resolved.dto);
    return {
      id: vm.id,
      name: vm.name,
      displayName: vm.displayName,
      spriteUrl: vm.spriteUrl,
    };
  }

  ngOnDestroy(): void {
    this.catalogSub?.unsubscribe();
    this.detailSub?.unsubscribe();
  }

  private fetchPokemonDto(normalized: string) {
    return this.http.get<unknown>(`${API_POKEMON_BASE}${encodeURIComponent(normalized)}`).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((raw): ResolvedPokemonResult => {
        const parsed = CachedPokemonResponseSchema.safeParse(raw);
        if (!parsed.success) {
          return { found: false, notFound: false, statusCode: null };
        }
        return {
          found: true,
          dto: parsed.data.pokemon,
          source: parsed.data.cache === 'hit' ? 'hit' : 'miss',
        };
      }),
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 404) {
          return of<ResolvedPokemonResult>({ found: false, notFound: true, statusCode: 404 });
        }
        return this.http.get<unknown>(`${POKEAPI_DETAIL_BASE}${encodeURIComponent(normalized)}`).pipe(
          timeout(REQUEST_TIMEOUT_MS),
          map((raw): ResolvedPokemonResult => {
            const parsed = PokemonDetailSchema.safeParse(raw);
            return parsed.success
              ? { found: true, dto: parsed.data, source: 'direct' }
              : { found: false, notFound: false, statusCode: null };
          }),
          catchError((directErr: unknown) => {
            const status =
              directErr instanceof HttpErrorResponse ? directErr.status || null : null;
            return of<ResolvedPokemonResult>({
              found: false,
              notFound: status === 404,
              statusCode: status,
            });
          }),
        );
      }),
    );
  }

  private toViewModel(dto: PokemonDetailDto): PokemonDetailView {
    const artwork = dto.sprites.other?.['official-artwork']?.front_default ?? null;
    const defaultSprite = dto.sprites.front_default ?? null;
    return {
      id: dto.id,
      name: dto.name.toLowerCase(),
      paddedId: `#${String(dto.id).padStart(4, '0')}`,
      displayName: formatPokeApiText(dto.name),
      spriteUrl: artwork ?? defaultSprite,
      fallbackSpriteUrl: defaultSprite,
      heightMeters: `${(dto.height / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`,
      weightKg: `${(dto.weight / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`,
      heightRawDm: dto.height,
      weightRawHg: dto.weight,
      types: dto.types.map((slot) => formatPokeApiText(slot.type.name)),
      abilities: dto.abilities.map((slot) =>
        slot.is_hidden
          ? `${formatPokeApiText(slot.ability.name)} (oculta)`
          : formatPokeApiText(slot.ability.name),
      ),
      stats: dto.stats.map((entry) => ({
        label: formatPokeApiText(entry.stat.name),
        value: entry.base_stat,
      })),
    };
  }
}
