import {
  type BerryDetail,
  BerryDetailSchema,
  type EggGroupDetail,
  EggGroupDetailSchema,
  type GrowthRateDetail,
  GrowthRateDetailSchema,
  type ItemDetail,
  ItemDetailSchema,
  type LocationDetail,
  LocationDetailSchema,
  type PokedexDetail,
  PokedexDetailSchema,
  type RegionDetail,
  RegionDetailSchema,
} from '@pokeverse/shared/pokedex-encyclopedia';
import {
  buildPokemonArtworkUrl,
  extractPokeApiId,
  safeHttpsUrl,
} from './pokeapi-details.mapper';
import {
  mapNamedResourceEntries,
  mapPokemonResourceRefs,
  namedOrNull,
  selectLocalizedEffect,
  selectLocalizedFlavors,
  selectPreferredText,
} from './pokeapi-encyclopedia-combat.mapper';
import type {
  RawPokeApiBerry,
  RawPokeApiEggGroup,
  RawPokeApiGrowthRate,
  RawPokeApiItem,
  RawPokeApiLocation,
  RawPokeApiPokedex,
  RawPokeApiRegion,
} from './pokeapi-encyclopedia-raw.schemas';

export function mapRawItemToDetail(raw: RawPokeApiItem): ItemDetail {
  const effectCopy = selectLocalizedEffect(raw.effect_entries);
  const heldByPokemon = raw.held_by_pokemon
    .map((entry) => {
      const pokemonId = extractPokeApiId(entry.pokemon.url);
      if (pokemonId === null) {
        return null;
      }
      const maxRarity = entry.version_details.reduce(
        (highest, detail) => Math.max(highest, detail.rarity),
        0,
      );
      return {
        pokemonId,
        pokemonName: entry.pokemon.name,
        artworkUrl: buildPokemonArtworkUrl(pokemonId),
        maxRarity,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.pokemonId - b.pokemonId);

  return ItemDetailSchema.parse({
    id: raw.id,
    name: raw.name,
    cost: raw.cost,
    flingPower: raw.fling_power ?? null,
    flingEffect: namedOrNull(raw.fling_effect),
    category: namedOrNull(raw.category),
    attributes: raw.attributes.map((attr) => attr.name),
    spriteUrl: safeHttpsUrl(raw.sprites?.default),
    shortEffect: effectCopy.shortEffect,
    effect: effectCopy.effect,
    flavorTexts: selectLocalizedFlavors(raw.flavor_text_entries),
    heldByPokemon,
  });
}

export function mapRawBerryToDetail(raw: RawPokeApiBerry): BerryDetail {
  return BerryDetailSchema.parse({
    id: raw.id,
    name: raw.name,
    growthTime: raw.growth_time,
    maxHarvest: raw.max_harvest,
    naturalGiftPower: raw.natural_gift_power,
    naturalGiftType: namedOrNull(raw.natural_gift_type),
    sizeMm: raw.size,
    smoothness: raw.smoothness,
    soilDryness: raw.soil_dryness,
    firmness: namedOrNull(raw.firmness),
    itemName: raw.item.name,
    itemId: extractPokeApiId(raw.item.url),
    flavors: raw.flavors.map((entry) => ({
      flavor: entry.flavor.name,
      potency: entry.potency,
    })),
  });
}

export function mapRawRegionToDetail(raw: RawPokeApiRegion): RegionDetail {
  return RegionDetailSchema.parse({
    id: raw.id,
    name: raw.name,
    mainGeneration: namedOrNull(raw.main_generation),
    pokedexes: mapNamedResourceEntries(raw.pokedexes),
    versionGroups: raw.version_groups.map((vg) => vg.name),
    locations: mapNamedResourceEntries(raw.locations),
  });
}

export function mapRawPokedexToDetail(raw: RawPokeApiPokedex): PokedexDetail {
  const entries = raw.pokemon_entries
    .map((entry) => {
      const speciesId = extractPokeApiId(entry.pokemon_species.url);
      if (speciesId === null) {
        return null;
      }
      return {
        entryNumber: entry.entry_number,
        speciesId,
        speciesName: entry.pokemon_species.name,
        artworkUrl: buildPokemonArtworkUrl(speciesId),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.entryNumber - b.entryNumber);

  return PokedexDetailSchema.parse({
    id: raw.id,
    name: raw.name,
    isMainSeries: raw.is_main_series,
    region: namedOrNull(raw.region),
    description: selectPreferredText(raw.descriptions),
    versionGroups: raw.version_groups.map((vg) => vg.name),
    totalEntries: entries.length,
    entries,
  });
}

export function mapRawLocationToDetail(
  raw: RawPokeApiLocation,
): LocationDetail {
  const generations = Array.from(
    new Set(raw.game_indices.map((entry) => entry.generation.name)),
  );
  return LocationDetailSchema.parse({
    id: raw.id,
    name: raw.name,
    region: namedOrNull(raw.region),
    localizedName: selectPreferredText(raw.names),
    areas: mapNamedResourceEntries(raw.areas),
    generations,
  });
}

export function mapRawEggGroupToDetail(
  raw: RawPokeApiEggGroup,
): EggGroupDetail {
  const pokemonSpecies = mapPokemonResourceRefs(raw.pokemon_species);
  return EggGroupDetailSchema.parse({
    id: raw.id,
    name: raw.name,
    speciesCount: pokemonSpecies.length,
    pokemonSpecies,
  });
}

export function mapRawGrowthRateToDetail(
  raw: RawPokeApiGrowthRate,
): GrowthRateDetail {
  const pokemonSpecies = mapPokemonResourceRefs(raw.pokemon_species);
  const levels = [...raw.levels].sort((a, b) => a.level - b.level);
  return GrowthRateDetailSchema.parse({
    id: raw.id,
    name: raw.name,
    formula: raw.formula,
    description: selectPreferredText(raw.descriptions),
    levels,
    speciesCount: pokemonSpecies.length,
    pokemonSpecies,
  });
}
