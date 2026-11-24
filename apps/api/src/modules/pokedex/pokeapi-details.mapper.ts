import type {
  EvolutionChainNode,
  EvolutionChainSummary,
  PokemonEncounterItem,
  PokemonFormItem,
  PokemonSpeciesSummary,
  PokemonVarietyRef,
} from '@pokeverse/shared';
import { isHttpsUrl } from '@pokeverse/shared';
import type {
  RawEvolutionChainLink,
  RawPokeApiEncounterList,
  RawPokeApiEvolutionChain,
  RawPokeApiForm,
  RawPokeApiSpecies,
} from './pokeapi-raw.schemas';

const GENERATION_ROMAN_MAP: Readonly<Record<string, number>> = {
  'generation-i': 1,
  'generation-ii': 2,
  'generation-iii': 3,
  'generation-iv': 4,
  'generation-v': 5,
  'generation-vi': 6,
  'generation-vii': 7,
  'generation-viii': 8,
  'generation-ix': 9,
};

const PREFERRED_LANGUAGES = ['pt-BR', 'pt', 'en', 'es', 'ja'] as const;
const ARTWORK_CDN_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';

export function safeHttpsUrl(value: unknown): string | null {
  return typeof value === 'string' && isHttpsUrl(value) ? value : null;
}

export function extractPokeApiId(url: string): number | null {
  const match = /\/(\d+)\/?$/.exec(url.trim());
  const rawId = match?.[1];
  if (!rawId) {
    return null;
  }
  const parsed = Number.parseInt(rawId, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function namedOrNull(
  resource: { readonly name: string } | null | undefined,
): string | null {
  return resource ? resource.name : null;
}

function cleanFlavorText(raw: string): string {
  return raw
    .replaceAll('\f', ' ')
    .replaceAll('\n', ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function selectPreferredGenera(
  rawGenera: RawPokeApiSpecies['genera'],
): PokemonSpeciesSummary['genera'] {
  const allowed = new Set<string>(PREFERRED_LANGUAGES);
  const filtered = rawGenera
    .filter((entry) => allowed.has(entry.language.name) && entry.genus.trim())
    .map((entry) => ({
      language: entry.language.name,
      genus: entry.genus.trim(),
    }));

  if (filtered.length > 0) {
    return filtered;
  }
  return rawGenera.slice(0, 1).map((entry) => ({
    language: entry.language.name,
    genus: entry.genus.trim(),
  }));
}

function resolvePrimaryGenus(
  genera: PokemonSpeciesSummary['genera'],
): string | null {
  for (const lang of PREFERRED_LANGUAGES) {
    const match = genera.find((entry) => entry.language === lang);
    if (match) {
      return match.genus;
    }
  }
  return genera[0]?.genus ?? null;
}

function selectFlavorTexts(
  entries: RawPokeApiSpecies['flavor_text_entries'],
): PokemonSpeciesSummary['flavorTexts'] {
  const allowed = new Set<string>(['pt-BR', 'pt', 'en', 'es']);
  const seen = new Set<string>();
  const result: PokemonSpeciesSummary['flavorTexts'] = [];

  for (const entry of entries) {
    if (!allowed.has(entry.language.name)) {
      continue;
    }
    const text = cleanFlavorText(entry.flavor_text);
    const dedupeKey = `${entry.version.name}:${entry.language.name}`;
    if (!text || seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    result.push({
      version: entry.version.name,
      language: entry.language.name,
      text,
    });
  }
  return result;
}

export function mapSpeciesVarieties(
  rawVarieties: RawPokeApiSpecies['varieties'],
): PokemonVarietyRef[] {
  const varieties: PokemonVarietyRef[] = [];
  for (const entry of rawVarieties) {
    const pokemonId = extractPokeApiId(entry.pokemon.url);
    if (pokemonId === null) {
      continue;
    }
    varieties.push({
      isDefault: entry.is_default,
      pokemonId,
      pokemonName: entry.pokemon.name,
      artworkUrl: `${ARTWORK_CDN_BASE}/${pokemonId}.png`,
    });
  }
  return varieties;
}

export function mapRawSpeciesToBundle(
  raw: RawPokeApiSpecies,
): PokemonSpeciesSummary {
  const genera = selectPreferredGenera(raw.genera);
  const generationName = namedOrNull(raw.generation);
  return {
    id: raw.id,
    name: raw.name,
    genus: resolvePrimaryGenus(genera),
    genera,
    flavorTexts: selectFlavorTexts(raw.flavor_text_entries),
    captureRate: raw.capture_rate,
    baseHappiness: raw.base_happiness ?? null,
    genderRate: raw.gender_rate,
    hasGenderDifferences: raw.has_gender_differences,
    hatchCounter: raw.hatch_counter ?? null,
    growthRate: namedOrNull(raw.growth_rate),
    color: namedOrNull(raw.color),
    shape: namedOrNull(raw.shape),
    habitat: namedOrNull(raw.habitat),
    generation: generationName,
    generationNumber: generationName
      ? (GENERATION_ROMAN_MAP[generationName] ?? null)
      : null,
    isBaby: raw.is_baby,
    isLegendary: raw.is_legendary,
    isMythical: raw.is_mythical,
    formsSwitchable: raw.forms_switchable,
    eggGroups: raw.egg_groups.map((group) => group.name),
    pokedexNumbers: raw.pokedex_numbers.map((num) => ({
      pokedex: num.pokedex.name,
      entryNumber: num.entry_number,
    })),
    evolvesFromSpecies: namedOrNull(raw.evolves_from_species),
    varieties: mapSpeciesVarieties(raw.varieties),
  };
}

function mapEvolutionDetail(
  detail: RawEvolutionChainLink['evolution_details'][number],
) {
  return {
    trigger: detail.trigger.name,
    minLevel: detail.min_level ?? null,
    item: namedOrNull(detail.item),
    heldItem: namedOrNull(detail.held_item),
    knownMove: namedOrNull(detail.known_move),
    knownMoveType: namedOrNull(detail.known_move_type),
    location: namedOrNull(detail.location),
    minHappiness: detail.min_happiness ?? null,
    minBeauty: detail.min_beauty ?? null,
    minAffection: detail.min_affection ?? null,
    needsOverworldRain: detail.needs_overworld_rain,
    timeOfDay: detail.time_of_day,
    gender: detail.gender ?? null,
    relativePhysicalStats: detail.relative_physical_stats ?? null,
    tradeSpecies: namedOrNull(detail.trade_species),
    partySpecies: namedOrNull(detail.party_species),
    partyType: namedOrNull(detail.party_type),
    turnUpsideDown: detail.turn_upside_down,
  };
}

function mapEvolutionLink(link: RawEvolutionChainLink): EvolutionChainNode {
  const speciesId = extractPokeApiId(link.species.url) ?? 1;
  return {
    speciesId,
    speciesName: link.species.name,
    isBaby: link.is_baby,
    evolutionDetails: link.evolution_details.map((detail) =>
      mapEvolutionDetail(detail),
    ),
    evolvesTo: link.evolves_to.map((child) => mapEvolutionLink(child)),
  };
}

export function mapRawEvolutionChain(
  raw: RawPokeApiEvolutionChain,
): EvolutionChainSummary {
  return {
    id: raw.id,
    babyTriggerItem: namedOrNull(raw.baby_trigger_item),
    root: mapEvolutionLink(raw.chain),
  };
}

export function mapRawEncounters(
  raw: RawPokeApiEncounterList,
): PokemonEncounterItem[] {
  return raw.map((area) => ({
    locationAreaName: area.location_area.name,
    locationAreaId: extractPokeApiId(area.location_area.url),
    versionDetails: area.version_details.map((versionEntry) => ({
      version: versionEntry.version.name,
      maxChance: versionEntry.max_chance,
      encounterDetails: versionEntry.encounter_details.map((detail) => ({
        minLevel: detail.min_level,
        maxLevel: detail.max_level,
        chance: detail.chance,
        method: detail.method.name,
        conditionValues: detail.condition_values.map((cond) => cond.name),
      })),
    })),
  }));
}

export function mapRawForm(raw: RawPokeApiForm): PokemonFormItem {
  return {
    id: raw.id,
    name: raw.name,
    formName: raw.form_name,
    formOrder: raw.form_order,
    isDefault: raw.is_default,
    isBattleOnly: raw.is_battle_only,
    isMega: raw.is_mega,
    versionGroup: namedOrNull(raw.version_group),
    types: raw.types,
    sprites: {
      frontDefault: safeHttpsUrl(raw.sprites.front_default),
      backDefault: safeHttpsUrl(raw.sprites.back_default),
      frontFemale: safeHttpsUrl(raw.sprites.front_female),
      frontShiny: safeHttpsUrl(raw.sprites.front_shiny),
      backShiny: safeHttpsUrl(raw.sprites.back_shiny),
      frontShinyFemale: safeHttpsUrl(raw.sprites.front_shiny_female),
    },
  };
}
