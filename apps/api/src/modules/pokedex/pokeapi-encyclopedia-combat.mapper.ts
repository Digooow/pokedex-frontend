import {
  type AbilityDetail,
  AbilityDetailSchema,
  type EncyclopediaListEntry,
  type EncyclopediaPokemonRef,
  type LocalizedFlavorEntry,
  type MoveDetail,
  MoveDetailSchema,
  type NatureSummary,
  NatureSummarySchema,
  type TypeDetail,
  TypeDetailSchema,
  type TypeSummary,
  TypeSummarySchema,
} from '@pokeverse/shared/pokedex-encyclopedia';
import {
  buildPokemonArtworkUrl,
  extractPokeApiId,
} from './pokeapi-details.mapper';
import type {
  RawPokeApiAbility,
  RawPokeApiFullType,
  RawPokeApiMove,
  RawPokeApiNature,
} from './pokeapi-encyclopedia-raw.schemas';

const PREFERRED_LANGUAGES = ['pt-BR', 'pt', 'en', 'es'] as const;

export function cleanEncyclopediaText(raw: string): string {
  return raw
    .replaceAll('\f', ' ')
    .replaceAll('\n', ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function namedOrNull(
  resource: { readonly name: string } | null | undefined,
): string | null {
  return resource ? resource.name : null;
}

export function mapNamedResourceEntries(
  resources: readonly { readonly name: string; readonly url: string }[],
): EncyclopediaListEntry[] {
  const entries: EncyclopediaListEntry[] = [];
  for (const resource of resources) {
    const id = extractPokeApiId(resource.url);
    if (id !== null) {
      entries.push({ id, name: resource.name });
    }
  }
  entries.sort((a, b) => a.id - b.id);
  return entries;
}

export function mapPokemonResourceRefs(
  resources: readonly { readonly name: string; readonly url: string }[],
): EncyclopediaPokemonRef[] {
  const refs: EncyclopediaPokemonRef[] = [];
  for (const resource of resources) {
    const pokemonId = extractPokeApiId(resource.url);
    if (pokemonId !== null) {
      refs.push({
        pokemonId,
        pokemonName: resource.name,
        artworkUrl: buildPokemonArtworkUrl(pokemonId),
      });
    }
  }
  refs.sort((a, b) => a.pokemonId - b.pokemonId);
  return refs;
}

function interpolateEffectChance(
  text: string,
  effectChance: number | null | undefined,
): string {
  if (effectChance === null || effectChance === undefined) {
    return text;
  }
  return text.replaceAll('$effect_chance', String(effectChance));
}

export function selectLocalizedEffect(
  entries: readonly {
    readonly effect: string;
    readonly short_effect: string;
    readonly language: { readonly name: string };
  }[],
  effectChance?: number | null,
): { readonly shortEffect: string | null; readonly effect: string | null } {
  for (const lang of PREFERRED_LANGUAGES) {
    const match = entries.find((entry) => entry.language.name === lang);
    if (match) {
      const shortEffect = cleanEncyclopediaText(
        interpolateEffectChance(match.short_effect, effectChance),
      );
      const effect = cleanEncyclopediaText(
        interpolateEffectChance(match.effect, effectChance),
      );
      return {
        shortEffect: shortEffect || null,
        effect: effect || null,
      };
    }
  }
  return { shortEffect: null, effect: null };
}

export function selectLocalizedFlavors(
  entries: readonly {
    readonly flavor_text?: string;
    readonly text?: string;
    readonly language: { readonly name: string };
    readonly version_group?: { readonly name: string } | null;
  }[],
): LocalizedFlavorEntry[] {
  const allowed = new Set<string>(PREFERRED_LANGUAGES);
  const seen = new Set<string>();
  const flavors: LocalizedFlavorEntry[] = [];

  for (const entry of entries) {
    const language = entry.language.name;
    if (!allowed.has(language)) {
      continue;
    }
    const text = cleanEncyclopediaText(entry.flavor_text ?? entry.text ?? '');
    const versionGroup = namedOrNull(entry.version_group);
    const dedupeKey = `${versionGroup ?? 'default'}:${language}`;
    if (!text || seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    flavors.push({ language, versionGroup, text });
  }
  return flavors;
}

export function selectPreferredText(
  entries: readonly {
    readonly language: { readonly name: string };
    readonly description?: string;
    readonly name?: string;
  }[],
): string | null {
  for (const lang of PREFERRED_LANGUAGES) {
    const match = entries.find((entry) => entry.language.name === lang);
    const rawText = match?.description ?? match?.name ?? '';
    const cleaned = cleanEncyclopediaText(rawText);
    if (cleaned) {
      return cleaned;
    }
  }
  return null;
}

export function mapRawMoveToDetail(raw: RawPokeApiMove): MoveDetail {
  const effectCopy = selectLocalizedEffect(
    raw.effect_entries,
    raw.effect_chance,
  );
  return MoveDetailSchema.parse({
    id: raw.id,
    name: raw.name,
    type: raw.type.name,
    damageClass: namedOrNull(raw.damage_class),
    power: raw.power ?? null,
    accuracy: raw.accuracy ?? null,
    pp: raw.pp ?? null,
    priority: raw.priority,
    effectChance: raw.effect_chance ?? null,
    target: namedOrNull(raw.target),
    generation: namedOrNull(raw.generation),
    ailment: namedOrNull(raw.meta?.ailment),
    category: namedOrNull(raw.meta?.category),
    statChanges: raw.stat_changes.map((entry) => ({
      stat: entry.stat.name,
      change: entry.change,
    })),
    shortEffect: effectCopy.shortEffect,
    effect: effectCopy.effect,
    flavorTexts: selectLocalizedFlavors(raw.flavor_text_entries),
    learnedByPokemon: mapPokemonResourceRefs(raw.learned_by_pokemon),
  });
}

export function mapRawAbilityToDetail(raw: RawPokeApiAbility): AbilityDetail {
  const effectCopy = selectLocalizedEffect(raw.effect_entries);
  const pokemon = raw.pokemon
    .map((entry) => {
      const pokemonId = extractPokeApiId(entry.pokemon.url);
      if (pokemonId === null) {
        return null;
      }
      return {
        pokemonId,
        pokemonName: entry.pokemon.name,
        artworkUrl: buildPokemonArtworkUrl(pokemonId),
        isHidden: entry.is_hidden,
        slot: entry.slot,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.pokemonId - b.pokemonId);

  return AbilityDetailSchema.parse({
    id: raw.id,
    name: raw.name,
    isMainSeries: raw.is_main_series,
    generation: namedOrNull(raw.generation),
    shortEffect: effectCopy.shortEffect,
    effect: effectCopy.effect,
    flavorTexts: selectLocalizedFlavors(raw.flavor_text_entries),
    pokemon,
  });
}

export function mapRawNatureToSummary(raw: RawPokeApiNature): NatureSummary {
  const increasedStat = namedOrNull(raw.increased_stat);
  const decreasedStat = namedOrNull(raw.decreased_stat);
  return NatureSummarySchema.parse({
    id: raw.id,
    name: raw.name,
    increasedStat,
    decreasedStat,
    likesFlavor: namedOrNull(raw.likes_flavor),
    hatesFlavor: namedOrNull(raw.hates_flavor),
    isNeutral: increasedStat === null && decreasedStat === null,
  });
}

export function mapRawTypeToSummary(raw: RawPokeApiFullType): TypeSummary {
  const relations = raw.damage_relations;
  return TypeSummarySchema.parse({
    id: raw.id,
    name: raw.name,
    generation: namedOrNull(raw.generation),
    moveDamageClass: namedOrNull(raw.move_damage_class),
    damageRelations: {
      doubleDamageFrom: relations.double_damage_from.map((t) => t.name),
      halfDamageFrom: relations.half_damage_from.map((t) => t.name),
      noDamageFrom: relations.no_damage_from.map((t) => t.name),
      doubleDamageTo: relations.double_damage_to.map((t) => t.name),
      halfDamageTo: relations.half_damage_to.map((t) => t.name),
      noDamageTo: relations.no_damage_to.map((t) => t.name),
    },
    pokemonCount: raw.pokemon.length,
    moveCount: raw.moves.length,
  });
}

export function mapRawTypeToDetail(raw: RawPokeApiFullType): TypeDetail {
  const summary = mapRawTypeToSummary(raw);
  const pokemon = raw.pokemon
    .map((entry) => {
      const pokemonId = extractPokeApiId(entry.pokemon.url);
      if (pokemonId === null) {
        return null;
      }
      return {
        pokemonId,
        pokemonName: entry.pokemon.name,
        artworkUrl: buildPokemonArtworkUrl(pokemonId),
        slot: entry.slot,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.pokemonId - b.pokemonId);

  return TypeDetailSchema.parse({
    ...summary,
    pokemon,
    moves: mapNamedResourceEntries(raw.moves),
  });
}
