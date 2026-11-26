import {
  type BaseStatsSpread,
  type GrowthRate,
  GrowthRateSchema,
  MAX_EV_PER_STAT,
  MAX_EV_TOTAL,
  calculateStatsAtLevel,
  calculateXpForLevel,
} from '@pokeverse/shared';
import type { PokemonDetailView } from './pokedex-view-mapper.util';

export type StatKey = keyof BaseStatsSpread;

export interface StatSpreadValues {
  readonly hp: number;
  readonly attack: number;
  readonly defense: number;
  readonly specialAttack: number;
  readonly specialDefense: number;
  readonly speed: number;
}

export interface PokemonNatureOption {
  readonly key: string;
  readonly label: string;
  readonly up: Exclude<StatKey, 'hp'> | null;
  readonly down: Exclude<StatKey, 'hp'> | null;
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

export const POKEMON_NATURES: readonly PokemonNatureOption[] = [
  { key: 'hardy', label: 'Hardy (Neutra)', up: null, down: null },
  { key: 'lonely', label: 'Lonely (+Atk, -Def)', up: 'attack', down: 'defense' },
  { key: 'brave', label: 'Brave (+Atk, -Spe)', up: 'attack', down: 'speed' },
  { key: 'adamant', label: 'Adamant (+Atk, -SpA)', up: 'attack', down: 'specialAttack' },
  { key: 'naughty', label: 'Naughty (+Atk, -SpD)', up: 'attack', down: 'specialDefense' },
  { key: 'bold', label: 'Bold (+Def, -Atk)', up: 'defense', down: 'attack' },
  { key: 'relaxed', label: 'Relaxed (+Def, -Spe)', up: 'defense', down: 'speed' },
  { key: 'impish', label: 'Impish (+Def, -SpA)', up: 'defense', down: 'specialAttack' },
  { key: 'lax', label: 'Lax (+Def, -SpD)', up: 'defense', down: 'specialDefense' },
  { key: 'timid', label: 'Timid (+Spe, -Atk)', up: 'speed', down: 'attack' },
  { key: 'hasty', label: 'Hasty (+Spe, -Def)', up: 'speed', down: 'defense' },
  { key: 'jolly', label: 'Jolly (+Spe, -SpA)', up: 'speed', down: 'specialAttack' },
  { key: 'naive', label: 'Naive (+Spe, -SpD)', up: 'speed', down: 'specialDefense' },
  { key: 'modest', label: 'Modest (+SpA, -Atk)', up: 'specialAttack', down: 'attack' },
  { key: 'mild', label: 'Mild (+SpA, -Def)', up: 'specialAttack', down: 'defense' },
  { key: 'quiet', label: 'Quiet (+SpA, -Spe)', up: 'specialAttack', down: 'speed' },
  { key: 'rash', label: 'Rash (+SpA, -SpD)', up: 'specialAttack', down: 'specialDefense' },
  { key: 'calm', label: 'Calm (+SpD, -Atk)', up: 'specialDefense', down: 'attack' },
  { key: 'gentle', label: 'Gentle (+SpD, -Def)', up: 'specialDefense', down: 'defense' },
  { key: 'sassy', label: 'Sassy (+SpD, -Spe)', up: 'specialDefense', down: 'speed' },
  { key: 'careful', label: 'Careful (+SpD, -SpA)', up: 'specialDefense', down: 'specialAttack' },
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
  if (bundleStats && bundleStats.length > 0) {
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
