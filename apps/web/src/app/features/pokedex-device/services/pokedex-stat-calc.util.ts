import {
  type AsyncState,
  type BaseStatsSpread,
  type GrowthRate,
  GrowthRateSchema,
  MAX_EV_PER_STAT,
  MAX_EV_TOTAL,
  POKEMON_NATURES,
  POKEMON_TYPES,
  type PokemonTypeName,
  type SearchablePokemonItem,
  type StatSpreadKey,
  calculateStatsAtLevel,
  calculateXpForLevel,
  filterPokemonCatalog,
} from '@pokeverse/shared';
import type { PokemonDetailView } from './pokedex-view-mapper.util';

export {
  COMPETITIVE_SPREAD_PRESETS,
  POKEMON_NATURES,
  type CompetitiveSpreadPreset,
  type PokemonNatureOption,
  type StatSpreadKey,
} from '@pokeverse/shared';

export type StatKey = StatSpreadKey;

export interface StatSpreadValues {
  readonly hp: number;
  readonly attack: number;
  readonly defense: number;
  readonly specialAttack: number;
  readonly specialDefense: number;
  readonly speed: number;
}

export interface StatFieldMeta {
  readonly key: StatKey;
  readonly label: string;
}

export const STAT_FIELDS: readonly StatFieldMeta[] = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: 'Atk' },
  { key: 'defense', label: 'Def' },
  { key: 'specialAttack', label: 'SpA' },
  { key: 'specialDefense', label: 'SpD' },
  { key: 'speed', label: 'Spe' },
];

export const DEFAULT_IV_SPREAD: StatSpreadValues = {
  hp: 31,
  attack: 31,
  defense: 31,
  specialAttack: 31,
  specialDefense: 31,
  speed: 31,
};

export const ZERO_SPREAD: StatSpreadValues = {
  hp: 0,
  attack: 0,
  defense: 0,
  specialAttack: 0,
  specialDefense: 0,
  speed: 0,
};

const API_STAT_TO_KEY: Readonly<Record<string, StatKey>> = {
  hp: 'hp',
  attack: 'attack',
  defense: 'defense',
  'special-attack': 'specialAttack',
  'special-defense': 'specialDefense',
  speed: 'speed',
};

const VALID_TYPE_SET: ReadonlySet<string> = new Set(POKEMON_TYPES);

export function extractBaseStatsSpread(pokemon: PokemonDetailView): BaseStatsSpread {
  const result: Record<StatKey, number> = {
    hp: 50,
    attack: 50,
    defense: 50,
    specialAttack: 50,
    specialDefense: 50,
    speed: 50,
  };
  const bundleStats = pokemon.bundle?.pokemon.stats;
  if (bundleStats?.length) {
    for (const entry of bundleStats) {
      const mapped = API_STAT_TO_KEY[entry.stat.name.toLowerCase()];
      if (mapped) {
        result[mapped] = Math.max(1, Math.min(255, entry.base_stat));
      }
    }
    return result;
  }
  for (const entry of pokemon.stats) {
    const mapped = API_STAT_TO_KEY[entry.label.toLowerCase().replaceAll(/\s+/g, '-')];
    if (mapped) {
      result[mapped] = Math.max(1, Math.min(255, entry.value));
    }
  }
  return result;
}

export function extractPokemonTypeSlugs(pokemon: PokemonDetailView): PokemonTypeName[] {
  const rawNames =
    pokemon.bundle?.pokemon.types.map((slot) => slot.type.name.trim().toLowerCase()) ??
    pokemon.types.map((label) => label.trim().toLowerCase());
  const valid = rawNames.filter((name): name is PokemonTypeName => VALID_TYPE_SET.has(name));
  return valid.length > 0 ? valid.slice(0, 2) : ['normal'];
}

export function buildQuickCatalogSuggestions(
  catalogState: AsyncState<readonly SearchablePokemonItem[]>,
  rawTerm: string,
  limit = 5,
): readonly SearchablePokemonItem[] {
  if (catalogState.status !== 'success') return [];
  const term = rawTerm.trim();
  if (!term) return catalogState.data.slice(0, limit);
  return filterPokemonCatalog(catalogState.data, term, limit).items;
}

export function resolveGrowthRate(pokemon: PokemonDetailView): GrowthRate {
  const raw = pokemon.bundle?.species.growthRate ?? 'medium';
  const parsed = GrowthRateSchema.safeParse(raw);
  return parsed.success ? parsed.data : 'medium';
}

export function buildNatureModifiers(natureKey: string) {
  const nature = POKEMON_NATURES.find((item) => item.key === natureKey) ?? POKEMON_NATURES[0];
  const pick = (stat: Exclude<StatKey, 'hp'>): 0.9 | 1 | 1.1 => {
    if (nature?.up === stat) return 1.1;
    if (nature?.down === stat) return 0.9;
    return 1;
  };
  return {
    attack: pick('attack'),
    defense: pick('defense'),
    specialAttack: pick('specialAttack'),
    specialDefense: pick('specialDefense'),
    speed: pick('speed'),
  };
}

export function sumSpread(spread: StatSpreadValues): number {
  return (
    spread.hp +
    spread.attack +
    spread.defense +
    spread.specialAttack +
    spread.specialDefense +
    spread.speed
  );
}

export function clampEvChange(
  current: StatSpreadValues,
  statKey: StatKey,
  rawValue: number,
): StatSpreadValues {
  const numeric = Number.isFinite(rawValue) ? Math.floor(rawValue) : 0;
  const otherTotal = sumSpread(current) - current[statKey];
  const remaining = Math.max(0, MAX_EV_TOTAL - otherTotal);
  const clamped = Math.max(0, Math.min(MAX_EV_PER_STAT, remaining, numeric));
  return { ...current, [statKey]: clamped };
}

export function clampIvChange(
  current: StatSpreadValues,
  statKey: StatKey,
  rawValue: number,
): StatSpreadValues {
  const numeric = Number.isFinite(rawValue) ? Math.floor(rawValue) : 0;
  const clamped = Math.max(0, Math.min(31, numeric));
  return { ...current, [statKey]: clamped };
}

export function computeCalculatorView(params: {
  readonly pokemon: PokemonDetailView;
  readonly level: number;
  readonly natureKey: string;
  readonly ivs: StatSpreadValues;
  readonly evs: StatSpreadValues;
}) {
  const safeLevel = Math.max(1, Math.min(100, Math.floor(params.level || 1)));
  const baseStats = extractBaseStatsSpread(params.pokemon);
  const natureModifiers = buildNatureModifiers(params.natureKey);
  const calculated = calculateStatsAtLevel({
    level: safeLevel,
    baseStats,
    ivs: params.ivs,
    evs: params.evs,
    natureModifiers,
  });
  const growthRate = resolveGrowthRate(params.pokemon);
  const xpRequired = calculateXpForLevel(safeLevel, growthRate);
  return {
    safeLevel,
    baseStats,
    calculated,
    growthRate,
    xpRequired,
    usedEvTotal: sumSpread(params.evs),
    remainingEvTotal: Math.max(0, MAX_EV_TOTAL - sumSpread(params.evs)),
  };
}
