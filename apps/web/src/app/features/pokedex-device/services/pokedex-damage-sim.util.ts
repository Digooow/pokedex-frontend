import {
  type BattleWeather,
  type CalculatedStatsResult,
  type MoveCategory,
  POKEMON_TYPES,
  type PokemonTypeName,
  calculatePokemonDamage,
  calculateStatsAtLevel,
  formatPokeApiText,
} from '@pokeverse/shared';
import type { MoveDetail } from '@pokeverse/shared/pokedex-encyclopedia';
import {
  DEFAULT_IV_SPREAD,
  ZERO_SPREAD,
  buildNatureModifiers,
  extractBaseStatsSpread,
  extractPokemonTypeSlugs,
} from './pokedex-stat-calc.util';
import type { PokemonDetailView } from './pokedex-view-mapper.util';

export type DefenderPresetId = 'neutral' | 'bulky-hp' | 'phys-wall' | 'spec-wall';

export interface DefenderPresetOption {
  readonly id: DefenderPresetId;
  readonly label: string;
  readonly natureKey: string;
  readonly evs: typeof ZERO_SPREAD;
}

export const DEFENDER_PRESETS: readonly DefenderPresetOption[] = [
  { id: 'neutral', label: 'Neutro (0 EV)', natureKey: 'hardy', evs: ZERO_SPREAD },
  {
    id: 'bulky-hp',
    label: 'Bulky HP (252 HP)',
    natureKey: 'hardy',
    evs: { ...ZERO_SPREAD, hp: 252 },
  },
  {
    id: 'phys-wall',
    label: 'Wall Física (+Def)',
    natureKey: 'impish',
    evs: { ...ZERO_SPREAD, hp: 252, defense: 252 },
  },
  {
    id: 'spec-wall',
    label: 'Wall Especial (+SpD)',
    natureKey: 'calm',
    evs: { ...ZERO_SPREAD, hp: 252, specialDefense: 252 },
  },
];

export const DAMAGE_STAGE_OPTIONS = [-6, -4, -2, -1, 0, 1, 2, 4, 6] as const;
export type DamageItemMultiplier = 1 | 1.1 | 1.2 | 1.3 | 1.5;

export function computeDefenderStats(
  pokemon: PokemonDetailView,
  level: number,
  presetId: DefenderPresetId,
) {
  const preset = DEFENDER_PRESETS.find((entry) => entry.id === presetId) ?? DEFENDER_PRESETS[0];
  const safeLevel = Math.max(1, Math.min(100, Math.floor(level || 50)));
  return calculateStatsAtLevel({
    level: safeLevel,
    baseStats: extractBaseStatsSpread(pokemon),
    ivs: DEFAULT_IV_SPREAD,
    evs: preset?.evs ?? ZERO_SPREAD,
    natureModifiers: buildNatureModifiers(preset?.natureKey ?? 'hardy'),
  });
}

export function resolveEffectivenessVariant(eff: number): string {
  if (eff === 0) return 'immune';
  if (eff >= 4) return 'quad-weak';
  if (eff >= 2) return 'weak';
  if (eff <= 0.25) return 'quad-resist';
  if (eff < 1) return 'resist';
  return 'neutral';
}

export function clampNumericInputEvent(event: Event, min: number, max: number): number | null {
  const raw = Number.parseInt((event.target as HTMLInputElement).value, 10);
  return Number.isFinite(raw) ? Math.max(min, Math.min(max, raw)) : null;
}

export function extractLearnedMoveOptions(pokemon: PokemonDetailView) {
  return (pokemon.bundle?.pokemon.moves ?? []).slice(0, 40).map((entry) => ({
    name: entry.name,
    label: formatPokeApiText(entry.name),
  }));
}

export function resolveLearnedMovePatch(move: MoveDetail): {
  readonly type: PokemonTypeName | null;
  readonly category: MoveCategory | null;
  readonly power: number | null;
} {
  const typeCandidate = move.type.toLowerCase() as PokemonTypeName;
  const type = POKEMON_TYPES.includes(typeCandidate) ? typeCandidate : null;
  const category =
    move.damageClass === 'physical' || move.damageClass === 'special' ? move.damageClass : null;
  const power = move.power !== null && move.power > 0 ? Math.min(250, move.power) : null;
  return { type, category, power };
}

export function computeDamageSimulation(params: {
  readonly attacker: PokemonDetailView;
  readonly attackerLevel: number;
  readonly attackerStats: CalculatedStatsResult;
  readonly defender: PokemonDetailView;
  readonly defenderStats: CalculatedStatsResult;
  readonly movePower: number;
  readonly moveCategory: MoveCategory;
  readonly moveType: PokemonTypeName;
  readonly isCritical: boolean;
  readonly weather: BattleWeather;
  readonly isBurned: boolean;
  readonly isDoublesSpread: boolean;
  readonly attackerStage: number;
  readonly defenderStage: number;
  readonly itemMultiplier: DamageItemMultiplier;
}) {
  const isPhys = params.moveCategory === 'physical';
  return calculatePokemonDamage({
    attackerLevel: params.attackerLevel,
    attackerStat: isPhys ? params.attackerStats.attack : params.attackerStats.specialAttack,
    defenderStat: isPhys ? params.defenderStats.defense : params.defenderStats.specialDefense,
    defenderMaxHp: params.defenderStats.hp,
    movePower: params.movePower,
    moveCategory: params.moveCategory,
    moveType: params.moveType,
    attackerTypes: extractPokemonTypeSlugs(params.attacker),
    defenderTypes: extractPokemonTypeSlugs(params.defender),
    isCritical: params.isCritical,
    weather: params.weather,
    isBurned: params.isBurned,
    isDoublesSpread: params.isDoublesSpread,
    attackerStage: params.attackerStage,
    defenderStage: params.defenderStage,
    itemMultiplier: params.itemMultiplier,
  });
}
