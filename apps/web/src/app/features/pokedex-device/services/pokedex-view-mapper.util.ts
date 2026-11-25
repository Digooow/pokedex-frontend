import {
  type PokeApiCatalogResponse,
  type PokemonBundle,
  type PokemonDetailDto,
  type SearchablePokemonItem,
  buildSearchableCatalogItem,
  extractPokemonIdFromUrl,
  formatPokeApiText,
} from '@pokeverse/shared';

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
