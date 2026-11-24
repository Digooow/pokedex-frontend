import type { PokemonBundle } from '@pokeverse/shared';
import { safeHttpsUrl } from './pokeapi-details.mapper';
import type { RawPokeApiPokemon } from './pokeapi-raw.schemas';

function mapSpriteGroup(
  group: RawPokeApiPokemon['sprites'] | undefined,
): PokemonBundle['pokemon']['sprites']['default'] {
  return {
    frontDefault: safeHttpsUrl(group?.front_default),
    backDefault: safeHttpsUrl(group?.back_default),
    frontShiny: safeHttpsUrl(group?.front_shiny),
    backShiny: safeHttpsUrl(group?.back_shiny),
    frontFemale: safeHttpsUrl(group?.front_female),
    backFemale: safeHttpsUrl(group?.back_female),
    frontShinyFemale: safeHttpsUrl(group?.front_shiny_female),
    backShinyFemale: safeHttpsUrl(group?.back_shiny_female),
  };
}

function mapSpritesSet(
  sprites: RawPokeApiPokemon['sprites'],
): PokemonBundle['pokemon']['sprites'] {
  const artwork = sprites.other?.['official-artwork'];
  const home = sprites.other?.home;
  const dreamWorld = sprites.other?.dream_world;
  return {
    officialArtwork: {
      frontDefault: safeHttpsUrl(artwork?.front_default),
      frontShiny: safeHttpsUrl(artwork?.front_shiny),
    },
    home: {
      frontDefault: safeHttpsUrl(home?.front_default),
      frontShiny: safeHttpsUrl(home?.front_shiny),
      frontFemale: safeHttpsUrl(home?.front_female),
      frontShinyFemale: safeHttpsUrl(home?.front_shiny_female),
    },
    showdown: mapSpriteGroup(sprites.other?.showdown),
    default: mapSpriteGroup(sprites),
    dreamWorld: {
      frontDefault: safeHttpsUrl(dreamWorld?.front_default),
      frontFemale: safeHttpsUrl(dreamWorld?.front_female),
    },
  };
}

function readRecordString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  return safeHttpsUrl(record[key]);
}

function mapHistoricalGameSprite(
  generation: string,
  game: string,
  rawEntry: unknown,
): PokemonBundle['pokemon']['historicalSprites'][number] | null {
  if (!rawEntry || typeof rawEntry !== 'object') {
    return null;
  }
  const record = rawEntry as Record<string, unknown>;
  const animatedRaw = record['animated'];
  const animated =
    animatedRaw && typeof animatedRaw === 'object'
      ? (animatedRaw as Record<string, unknown>)
      : null;
  const frontDefault = readRecordString(record, 'front_default');
  const frontShiny = readRecordString(record, 'front_shiny');
  const animatedFrontDefault = animated
    ? readRecordString(animated, 'front_default')
    : null;
  const animatedFrontShiny = animated
    ? readRecordString(animated, 'front_shiny')
    : null;

  if (
    !frontDefault &&
    !frontShiny &&
    !animatedFrontDefault &&
    !animatedFrontShiny
  ) {
    return null;
  }
  return {
    generation,
    game,
    frontDefault,
    frontShiny,
    animatedFrontDefault,
    animatedFrontShiny,
  };
}

function extractHistoricalSprites(
  versions: RawPokeApiPokemon['sprites']['versions'],
): PokemonBundle['pokemon']['historicalSprites'] {
  if (!versions) {
    return [];
  }

  const entries: PokemonBundle['pokemon']['historicalSprites'] = [];
  for (const [generation, games] of Object.entries(versions)) {
    for (const [game, rawEntry] of Object.entries(games)) {
      const mapped = mapHistoricalGameSprite(generation, game, rawEntry);
      if (mapped) {
        entries.push(mapped);
      }
    }
  }
  return entries;
}

function mapPokemonHistoryAndMoves(raw: RawPokeApiPokemon) {
  return {
    moves: raw.moves.map((entry) => ({
      name: entry.move.name,
      versionGroupDetails: entry.version_group_details.map((detail) => ({
        levelLearnedAt: detail.level_learned_at,
        learnMethod: detail.move_learn_method.name,
        versionGroup: detail.version_group.name,
      })),
    })),
    heldItems: raw.held_items.map((entry) => ({
      itemName: entry.item.name,
      versionDetails: entry.version_details.map((detail) => ({
        version: detail.version.name,
        rarity: detail.rarity,
      })),
    })),
    pastTypes: raw.past_types.map((entry) => ({
      generation: entry.generation.name,
      types: entry.types,
    })),
    pastAbilities: raw.past_abilities.map((entry) => ({
      generation: entry.generation.name,
      abilities: entry.abilities.map((ab) => ({
        name: ab.ability?.name ?? null,
        slot: ab.slot,
        isHidden: ab.is_hidden,
      })),
    })),
    pastStats: raw.past_stats.map((entry) => ({
      generation: entry.generation.name,
      stats: entry.stats,
    })),
  };
}

export function mapRawPokemonToBundle(
  raw: RawPokeApiPokemon,
): PokemonBundle['pokemon'] {
  const baseStatTotal = raw.stats.reduce(
    (sum, item) => sum + item.base_stat,
    0,
  );
  return {
    id: raw.id,
    name: raw.name,
    order: raw.order,
    isDefault: raw.is_default,
    height: raw.height,
    weight: raw.weight,
    baseExperience: raw.base_experience ?? null,
    baseStatTotal,
    types: raw.types,
    abilities: raw.abilities,
    stats: raw.stats,
    sprites: mapSpritesSet(raw.sprites),
    historicalSprites: extractHistoricalSprites(raw.sprites.versions),
    cries: {
      latest: safeHttpsUrl(raw.cries?.latest),
      legacy: safeHttpsUrl(raw.cries?.legacy),
    },
    ...mapPokemonHistoryAndMoves(raw),
  };
}
