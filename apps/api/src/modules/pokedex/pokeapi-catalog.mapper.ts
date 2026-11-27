import { ServiceUnavailableException } from '@nestjs/common';
import {
  POKEMON_TYPES,
  type PokeApiCatalogResponse,
  type PokemonTypeName,
  extractPokemonIdFromUrl,
} from '@pokeverse/shared';
import {
  type EnrichedCatalogEntry,
  type EnrichedCatalogPayload,
  EnrichedCatalogPayloadSchema,
  type FilterOptionItem,
  type GenerationFilterOption,
  type PokedexMetaFilters,
  PokedexMetaFiltersSchema,
} from '@pokeverse/shared/pokedex-encyclopedia';
import {
  GraphQlEnrichedCatalogResponseSchema,
  type GraphQlEnrichedPokemonRow,
  GraphQlMetaFiltersResponseSchema,
} from './pokeapi-graphql.schemas';

const POKEMON_TYPE_SET: ReadonlySet<string> = new Set(POKEMON_TYPES);

const GENERATION_MAIN_REGIONS: Readonly<Record<number, string>> = {
  1: 'kanto',
  2: 'johto',
  3: 'hoenn',
  4: 'sinnoh',
  5: 'unova',
  6: 'kalos',
  7: 'alola',
  8: 'galar',
  9: 'paldea',
};

export interface RestMetaFilterLists {
  readonly generations: PokeApiCatalogResponse;
  readonly habitats: PokeApiCatalogResponse;
  readonly colors: PokeApiCatalogResponse;
  readonly shapes: PokeApiCatalogResponse;
  readonly eggGroups: PokeApiCatalogResponse;
  readonly growthRates: PokeApiCatalogResponse;
  readonly regions: PokeApiCatalogResponse;
  readonly types: PokeApiCatalogResponse;
}

function isPokemonTypeName(name: string): name is PokemonTypeName {
  return POKEMON_TYPE_SET.has(name);
}

function normalizeGenerationId(
  rawId: number | null | undefined,
): number | null {
  if (rawId === null || rawId === undefined) {
    return null;
  }
  if (!Number.isInteger(rawId) || rawId < 1 || rawId > 9) {
    return null;
  }
  return rawId;
}

function mapSpecyAttributes(specy: GraphQlEnrichedPokemonRow['pokemonspecy']) {
  if (!specy) {
    return {
      generation: null,
      habitat: null,
      color: null,
      shape: null,
      isLegendary: false,
      isMythical: false,
      isBaby: false,
    };
  }
  return {
    generation: normalizeGenerationId(specy.generation_id),
    habitat: specy.pokemonhabitat?.name.toLowerCase() ?? null,
    color: specy.pokemoncolor?.name.toLowerCase() ?? null,
    shape: specy.pokemonshape?.name.toLowerCase() ?? null,
    isLegendary: specy.is_legendary,
    isMythical: specy.is_mythical,
    isBaby: specy.is_baby,
  };
}

function mapGraphQlPokemonRow(
  row: GraphQlEnrichedPokemonRow,
): EnrichedCatalogEntry {
  const types = [...row.pokemontypes]
    .sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99))
    .map((entry) => entry.type.name.toLowerCase())
    .filter((name) => isPokemonTypeName(name))
    .slice(0, 2);

  const baseStatTotal = row.pokemonstats.reduce(
    (sum, stat) => sum + stat.base_stat,
    0,
  );

  return {
    id: row.id,
    name: row.name.toLowerCase(),
    isDefault: row.is_default,
    types,
    baseStatTotal,
    ...mapSpecyAttributes(row.pokemonspecy),
  };
}

export function mapGraphQlCatalogToEnriched(
  raw: unknown,
): EnrichedCatalogPayload {
  const parsed = GraphQlEnrichedCatalogResponseSchema.safeParse(raw);
  if (
    !parsed.success ||
    (parsed.data.errors && parsed.data.errors.length > 0) ||
    !parsed.data.data ||
    parsed.data.data.pokemon.length === 0
  ) {
    throw new ServiceUnavailableException(
      'Resposta GraphQL inválida ou vazia da PokéAPI.',
    );
  }

  const items = parsed.data.data.pokemon
    .map((row) => mapGraphQlPokemonRow(row))
    .sort((a, b) => a.id - b.id);

  return EnrichedCatalogPayloadSchema.parse({
    source: 'graphql',
    degraded: false,
    count: items.length,
    items,
  });
}

export function mapRestCatalogToDegradedEnriched(
  catalog: PokeApiCatalogResponse,
): EnrichedCatalogPayload {
  const items: EnrichedCatalogEntry[] = [];
  for (const entry of catalog.results) {
    const id = extractPokemonIdFromUrl(entry.url);
    if (id <= 0) {
      continue;
    }
    items.push({
      id,
      name: entry.name.toLowerCase(),
      isDefault: id < 10_000,
      types: [],
      generation: null,
      habitat: null,
      color: null,
      shape: null,
      isLegendary: false,
      isMythical: false,
      isBaby: false,
      baseStatTotal: 0,
    });
  }

  items.sort((a, b) => a.id - b.id);
  return EnrichedCatalogPayloadSchema.parse({
    source: 'rest-fallback',
    degraded: true,
    count: items.length,
    items,
  });
}

function sortOptionsById<T extends FilterOptionItem>(
  options: readonly T[],
): T[] {
  return [...options].sort((a, b) => a.id - b.id);
}

function mapRestListToOptions(
  catalog: PokeApiCatalogResponse,
): FilterOptionItem[] {
  const options: FilterOptionItem[] = [];
  for (const entry of catalog.results) {
    const id = extractPokemonIdFromUrl(entry.url);
    if (id > 0) {
      options.push({ id, name: entry.name.toLowerCase() });
    }
  }
  return sortOptionsById(options);
}

export function mapGraphQlMetaToFilters(raw: unknown): PokedexMetaFilters {
  const parsed = GraphQlMetaFiltersResponseSchema.safeParse(raw);
  if (
    !parsed.success ||
    (parsed.data.errors && parsed.data.errors.length > 0) ||
    !parsed.data.data
  ) {
    throw new ServiceUnavailableException(
      'Resposta de metadados GraphQL inválida da PokéAPI.',
    );
  }

  const data = parsed.data.data;
  const generations: GenerationFilterOption[] = sortOptionsById(
    data.generation.map((gen) => ({
      id: gen.id,
      name: gen.name.toLowerCase(),
      regionName:
        gen.region?.name.toLowerCase() ??
        GENERATION_MAIN_REGIONS[gen.id] ??
        null,
    })),
  );

  const types = sortOptionsById(
    data.type
      .map((t) => ({ id: t.id, name: t.name.toLowerCase() }))
      .filter((t) => isPokemonTypeName(t.name)),
  );

  return PokedexMetaFiltersSchema.parse({
    types,
    generations,
    habitats: sortOptionsById(data.pokemonhabitat),
    colors: sortOptionsById(data.pokemoncolor),
    shapes: sortOptionsById(data.pokemonshape),
    eggGroups: sortOptionsById(data.egggroup),
    growthRates: sortOptionsById(data.growthrate),
    regions: sortOptionsById(data.region),
  });
}

export function mapRestListsToMetaFilters(
  lists: RestMetaFilterLists,
): PokedexMetaFilters {
  const generations: GenerationFilterOption[] = mapRestListToOptions(
    lists.generations,
  ).map((gen) => ({
    ...gen,
    regionName: GENERATION_MAIN_REGIONS[gen.id] ?? null,
  }));

  const types = mapRestListToOptions(lists.types).filter((t) =>
    isPokemonTypeName(t.name),
  );

  return PokedexMetaFiltersSchema.parse({
    types,
    generations,
    habitats: mapRestListToOptions(lists.habitats),
    colors: mapRestListToOptions(lists.colors),
    shapes: mapRestListToOptions(lists.shapes),
    eggGroups: mapRestListToOptions(lists.eggGroups),
    growthRates: mapRestListToOptions(lists.growthRates),
    regions: mapRestListToOptions(lists.regions),
  });
}
