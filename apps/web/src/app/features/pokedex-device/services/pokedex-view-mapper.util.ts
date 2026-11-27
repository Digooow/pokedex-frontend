import {
  type AsyncState,
  type CatalogFilterResult,
  type EnrichedCatalogItem,
  type PokeApiCatalogResponse,
  type PokedexAdvancedQuery,
  type PokemonBundle,
  type PokemonDetailDto,
  type SearchablePokemonItem,
  buildSearchableCatalogItem,
  extractPokemonIdFromUrl,
  filterCatalogWithAdvancedQuery,
  formatPokeApiText,
} from '@pokeverse/shared';
import { matchesAllowedSpeciesSet } from './pokedex-attribute-search.util';

export type PokedexCacheSource = 'hit' | 'miss' | 'stale-fallback' | 'direct';

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
  readonly bundle: PokemonBundle | null;
}

export interface ResolvedPokemonForSlot {
  readonly id: number;
  readonly name: string;
  readonly displayName: string;
  readonly spriteUrl: string | null;
}

export type ResolvedPokemonResult =
  | {
      readonly found: true;
      readonly dto: PokemonDetailDto | null;
      readonly bundle: PokemonBundle | null;
      readonly source: PokedexCacheSource;
    }
  | { readonly found: false; readonly notFound: boolean; readonly statusCode: number | null };

export function mapCatalogEntriesToSearchable(
  catalog: PokeApiCatalogResponse,
): SearchablePokemonItem[] {
  return catalog.results
    .map((entry) => buildSearchableCatalogItem(extractPokemonIdFromUrl(entry.url), entry.name))
    .filter((item) => item.id > 0);
}

function formatMetricLabel(rawTenths: number, unit: 'm' | 'kg'): string {
  const formatted = (rawTenths / 10).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${formatted} ${unit}`;
}

function formatAbilityLabel(name: string, isHidden: boolean): string {
  const formatted = formatPokeApiText(name);
  return isHidden ? `${formatted} (oculta)` : formatted;
}

export function mapPokemonDtoToView(dto: PokemonDetailDto): PokemonDetailView {
  const artwork = dto.sprites.other?.['official-artwork']?.front_default ?? null;
  const defaultSprite = dto.sprites.front_default ?? null;
  return {
    id: dto.id,
    name: dto.name.toLowerCase(),
    paddedId: `#${String(dto.id).padStart(4, '0')}`,
    displayName: formatPokeApiText(dto.name),
    spriteUrl: artwork ?? defaultSprite,
    fallbackSpriteUrl: defaultSprite,
    heightMeters: formatMetricLabel(dto.height, 'm'),
    weightKg: formatMetricLabel(dto.weight, 'kg'),
    heightRawDm: dto.height,
    weightRawHg: dto.weight,
    types: dto.types.map((slot) => formatPokeApiText(slot.type.name)),
    abilities: dto.abilities.map((slot) => formatAbilityLabel(slot.ability.name, slot.is_hidden)),
    stats: dto.stats.map((entry) => ({
      label: formatPokeApiText(entry.stat.name),
      value: entry.base_stat,
    })),
    bundle: null,
  };
}

export function mapPokemonBundleToView(bundle: PokemonBundle): PokemonDetailView {
  const pokemon = bundle.pokemon;
  const artwork = pokemon.sprites.officialArtwork.frontDefault;
  const defaultSprite = pokemon.sprites.default.frontDefault;
  return {
    id: pokemon.id,
    name: pokemon.name.toLowerCase(),
    paddedId: `#${String(pokemon.id).padStart(4, '0')}`,
    displayName: formatPokeApiText(pokemon.name),
    spriteUrl: artwork ?? defaultSprite,
    fallbackSpriteUrl: defaultSprite,
    heightMeters: formatMetricLabel(pokemon.height, 'm'),
    weightKg: formatMetricLabel(pokemon.weight, 'kg'),
    heightRawDm: pokemon.height,
    weightRawHg: pokemon.weight,
    types: pokemon.types.map((slot) => formatPokeApiText(slot.type.name)),
    abilities: pokemon.abilities.map((slot) =>
      formatAbilityLabel(slot.ability.name, slot.is_hidden),
    ),
    stats: pokemon.stats.map((entry) => ({
      label: formatPokeApiText(entry.stat.name),
      value: entry.base_stat,
    })),
    bundle,
  };
}

export function mapResolvedPokemonToView(
  resolved: Extract<ResolvedPokemonResult, { readonly found: true }>,
): PokemonDetailView | null {
  if (resolved.bundle) return mapPokemonBundleToView(resolved.bundle);
  if (resolved.dto) return mapPokemonDtoToView(resolved.dto);
  return null;
}

export function toResolvedPokemonForSlot(dto: PokemonDetailDto): ResolvedPokemonForSlot {
  const vm = mapPokemonDtoToView(dto);
  return {
    id: vm.id,
    name: vm.name,
    displayName: vm.displayName,
    spriteUrl: vm.spriteUrl,
  };
}

export function buildPokemonFetchErrorMessage(
  rawTerm: string,
  err: Extract<ResolvedPokemonResult, { readonly found: false }>,
): string {
  if (err.notFound) {
    return `Não encontramos nenhum Pokémon com o nome "${rawTerm}". Verifique a ortografia ou escolha uma sugestão.`;
  }
  if (err.statusCode) {
    return `Não foi possível concluir a comunicação com a PokéAPI no momento (código HTTP ${err.statusCode}).`;
  }
  return 'A PokéAPI não respondeu a tempo. Verifique sua conexão com a internet e tente novamente.';
}

export function mapResolvedResultToAsyncState(
  resolved: ResolvedPokemonResult,
  rawTerm: string,
): AsyncState<PokemonDetailView> {
  if (!resolved.found) {
    return {
      status: 'error',
      error: {
        code: resolved.notFound ? 'POKEMON_NOT_FOUND' : 'POKEMON_FETCH_FAILED',
        message: buildPokemonFetchErrorMessage(rawTerm, resolved),
        retryable: !resolved.notFound,
      },
    };
  }

  const vm = mapResolvedPokemonToView(resolved);
  if (!vm) {
    return {
      status: 'error',
      error: {
        code: 'POKEMON_FETCH_FAILED',
        message: 'Resposta inválida ao carregar os dados do Pokémon.',
        retryable: true,
      },
    };
  }

  return { status: 'success', data: vm };
}

export function buildAdvancedCatalogResult(
  enriched: readonly EnrichedCatalogItem[],
  queryPayload: PokedexAdvancedQuery,
  hasTerm: boolean,
  batchLimit: number,
  remoteAllowedNames: ReadonlySet<string> | null = null,
): { readonly totalMatches: number; readonly result: CatalogFilterResult } {
  const baseMatches = filterCatalogWithAdvancedQuery(enriched, queryPayload);
  const matches = remoteAllowedNames
    ? baseMatches.filter((item) => matchesAllowedSpeciesSet(item.name, remoteAllowedNames))
    : baseMatches;
  const sliced = hasTerm ? matches : matches.slice(0, batchLimit);
  return {
    totalMatches: matches.length,
    result: {
      mode: 'exact',
      items: sliced.map((item) => ({
        id: item.id,
        name: item.name,
        displayName: item.displayName,
        compactName: item.compactName,
        phoneticName: item.phoneticName,
        score: 0,
        approximate: false,
      })),
    },
  };
}

export function resolveCatalogStatusLabel(params: {
  readonly hasActiveFilters: boolean;
  readonly enrichedStatus: string;
  readonly remoteLookupStatus?: string;
  readonly catalogStatus: string;
  readonly totalCount: number;
  readonly term: string;
  readonly filteredCount: number;
  readonly filterMode: string;
}): string {
  if (params.hasActiveFilters) {
    if (params.enrichedStatus === 'loading' || params.remoteLookupStatus === 'loading') {
      return 'Aplicando filtros avançados...';
    }
    if (params.enrichedStatus === 'error' || params.remoteLookupStatus === 'error') {
      return 'Filtros avançados indisponíveis.';
    }
    return params.totalCount === 0
      ? 'Nenhum Pokémon com os filtros ativos'
      : `${params.totalCount} Pokémon com filtros ativos`;
  }
  if (params.catalogStatus === 'loading') return 'Carregando lista da PokéAPI...';
  if (params.catalogStatus === 'error') return 'Não foi possível carregar a lista completa agora.';
  if (params.catalogStatus !== 'success') return 'Aguardando abertura do módulo...';
  if (!params.term) return `Todos os Pokémon (${params.totalCount})`;
  if (params.filteredCount === 0) return `Nenhum match para "${params.term}"`;
  if (params.filterMode === 'approximate') return `Sugestões aproximadas (${params.filteredCount})`;
  return `${params.filteredCount} Pokémon encontrados`;
}

export function resolveVisorBadge(
  editMode: boolean,
  notice: { readonly label: string; readonly variant: 'sucesso' | 'aviso' } | null,
  state: AsyncState<PokemonDetailView>,
  src: PokedexCacheSource | null,
): { readonly label: string; readonly variant: string } {
  if (editMode) return { variant: 'aviso', label: 'Botões Azuis' };
  if (notice) return notice;
  if (state.status === 'loading') return { variant: 'carregando', label: 'Buscando...' };
  if (state.status === 'error') {
    return state.error.code === 'POKEMON_NOT_FOUND'
      ? { variant: 'aviso', label: 'Não encontrado' }
      : { variant: 'erro', label: 'Erro na API' };
  }
  if (state.status !== 'success') return { variant: 'aguardando', label: 'Aguardando busca' };
  if (src === 'hit') return { variant: 'sucesso', label: 'Encontrado · Redis' };
  if (src === 'stale-fallback') return { variant: 'sucesso', label: 'Encontrado · Reserva' };
  return { variant: 'sucesso', label: 'Encontrado' };
}

export function findPokemonIndexByIdentifier(
  items: ReadonlyArray<{ readonly id: number; readonly name: string }>,
  rawIdentifier: string | number | null,
): number {
  if (rawIdentifier === null) return -1;
  const target = String(rawIdentifier).trim().toLowerCase();
  if (!target) return -1;
  const numericId = Number.parseInt(target.replace(/^#/, ''), 10);
  return items.findIndex(
    (item) =>
      item.name.toLowerCase() === target || (!Number.isNaN(numericId) && item.id === numericId),
  );
}
