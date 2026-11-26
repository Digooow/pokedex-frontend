import * as z from 'zod';
import { POKEMON_TYPES, type PokemonTypeName } from '../constants/platform.constants';

export const PokemonTypeSchema = z.enum(POKEMON_TYPES);
export const MoveCategorySchema = z.enum(['physical', 'special']);
export const BattleWeatherSchema = z.enum(['none', 'sun', 'rain', 'sand', 'snow']);
export type MoveCategory = z.infer<typeof MoveCategorySchema>;
export type BattleWeather = z.infer<typeof BattleWeatherSchema>;

interface OffensiveMatchup {
  readonly superEffective: readonly PokemonTypeName[];
  readonly notVeryEffective: readonly PokemonTypeName[];
  readonly noEffect: readonly PokemonTypeName[];
}

const OFFENSIVE_TYPE_CHART: Readonly<Record<PokemonTypeName, OffensiveMatchup>> = {
  normal: { superEffective: [], notVeryEffective: ['rock', 'steel'], noEffect: ['ghost'] },
  fire: {
    superEffective: ['grass', 'ice', 'bug', 'steel'],
    notVeryEffective: ['fire', 'water', 'rock', 'dragon'],
    noEffect: [],
  },
  water: {
    superEffective: ['fire', 'ground', 'rock'],
    notVeryEffective: ['water', 'grass', 'dragon'],
    noEffect: [],
  },
  electric: {
    superEffective: ['water', 'flying'],
    notVeryEffective: ['electric', 'grass', 'dragon'],
    noEffect: ['ground'],
  },
  grass: {
    superEffective: ['water', 'ground', 'rock'],
    notVeryEffective: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'],
    noEffect: [],
  },
  ice: {
    superEffective: ['grass', 'ground', 'flying', 'dragon'],
    notVeryEffective: ['fire', 'water', 'ice', 'steel'],
    noEffect: [],
  },
  fighting: {
    superEffective: ['normal', 'ice', 'rock', 'dark', 'steel'],
    notVeryEffective: ['poison', 'flying', 'psychic', 'bug', 'fairy'],
    noEffect: ['ghost'],
  },
  poison: {
    superEffective: ['grass', 'fairy'],
    notVeryEffective: ['poison', 'ground', 'rock', 'ghost'],
    noEffect: ['steel'],
  },
  ground: {
    superEffective: ['fire', 'electric', 'poison', 'rock', 'steel'],
    notVeryEffective: ['grass', 'bug'],
    noEffect: ['flying'],
  },
  flying: {
    superEffective: ['grass', 'fighting', 'bug'],
    notVeryEffective: ['electric', 'rock', 'steel'],
    noEffect: [],
  },
  psychic: {
    superEffective: ['fighting', 'poison'],
    notVeryEffective: ['psychic', 'steel'],
    noEffect: ['dark'],
  },
  bug: {
    superEffective: ['grass', 'psychic', 'dark'],
    notVeryEffective: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'],
    noEffect: [],
  },
  rock: {
    superEffective: ['fire', 'ice', 'flying', 'bug'],
    notVeryEffective: ['fighting', 'ground', 'steel'],
    noEffect: [],
  },
  ghost: {
    superEffective: ['psychic', 'ghost'],
    notVeryEffective: ['dark'],
    noEffect: ['normal'],
  },
  dragon: { superEffective: ['dragon'], notVeryEffective: ['steel'], noEffect: ['fairy'] },
  dark: {
    superEffective: ['psychic', 'ghost'],
    notVeryEffective: ['fighting', 'dark', 'fairy'],
    noEffect: [],
  },
  steel: {
    superEffective: ['ice', 'rock', 'fairy'],
    notVeryEffective: ['fire', 'water', 'electric', 'steel'],
    noEffect: [],
  },
  fairy: {
    superEffective: ['fighting', 'dragon', 'dark'],
    notVeryEffective: ['fire', 'poison', 'steel'],
    noEffect: [],
  },
};

export function computeAttackTypeMultiplier(
  moveType: PokemonTypeName,
  defenderTypes: readonly PokemonTypeName[],
): number {
  const chart = OFFENSIVE_TYPE_CHART[moveType];
  const uniqueDefenders = Array.from(new Set(defenderTypes));
  let multiplier = 1;
  for (const defType of uniqueDefenders) {
    if (chart.noEffect.includes(defType)) return 0;
    if (chart.superEffective.includes(defType)) multiplier *= 2;
    else if (chart.notVeryEffective.includes(defType)) multiplier *= 0.5;
  }
  return multiplier;
}

export const DamageCalculationInputSchema = z.object({
  attackerLevel: z.number().int().min(1).max(100).default(50),
  attackerStat: z.number().int().min(1).max(2000),
  defenderStat: z.number().int().min(1).max(2000),
  defenderMaxHp: z.number().int().min(1).max(2000),
  movePower: z.number().int().min(1).max(250),
  moveCategory: MoveCategorySchema,
  moveType: PokemonTypeSchema,
  attackerTypes: z.array(PokemonTypeSchema).min(1).max(2),
  defenderTypes: z.array(PokemonTypeSchema).min(1).max(2),
  isCritical: z.boolean().default(false),
  weather: BattleWeatherSchema.default('none'),
  isBurned: z.boolean().default(false),
  isDoublesSpread: z.boolean().default(false),
  attackerStage: z.number().int().min(-6).max(6).default(0),
  defenderStage: z.number().int().min(-6).max(6).default(0),
  itemMultiplier: z
    .union([z.literal(1), z.literal(1.1), z.literal(1.2), z.literal(1.3), z.literal(1.5)])
    .default(1),
});

export type DamageCalculationInput = z.input<typeof DamageCalculationInputSchema>;
type ParsedDamageInput = z.infer<typeof DamageCalculationInputSchema>;

export interface DamageCalculationResult {
  readonly rolls: readonly number[];
  readonly minDamage: number;
  readonly maxDamage: number;
  readonly minPercent: number;
  readonly maxPercent: number;
  readonly stabApplied: boolean;
  readonly typeEffectiveness: number;
  readonly koChanceLabel: string;
}

function applyStatStage(stat: number, stage: number): number {
  if (stage === 0) return stat;
  return stage > 0 ? Math.floor((stat * (2 + stage)) / 2) : Math.floor((stat * 2) / (2 - stage));
}

function resolveEffectiveDefense(input: ParsedDamageInput): number {
  const defStage = input.isCritical && input.defenderStage > 0 ? 0 : input.defenderStage;
  const baseDef = Math.max(1, applyStatStage(input.defenderStat, defStage));
  const hasWeatherBoost =
    (input.weather === 'sand' &&
      input.moveCategory === 'special' &&
      input.defenderTypes.includes('rock')) ||
    (input.weather === 'snow' &&
      input.moveCategory === 'physical' &&
      input.defenderTypes.includes('ice'));
  return hasWeatherBoost ? Math.floor(baseDef * 1.5) : baseDef;
}

function resolveWeatherMultiplier(weather: BattleWeather, moveType: PokemonTypeName): number {
  if (weather === 'sun') {
    if (moveType === 'fire') return 1.5;
    if (moveType === 'water') return 0.5;
  }
  if (weather === 'rain') {
    if (moveType === 'water') return 1.5;
    if (moveType === 'fire') return 0.5;
  }
  return 1;
}

function applyPokemonRoundHalfDown(value: number): number {
  const frac = value - Math.floor(value);
  return frac > 0.5 ? Math.ceil(value) : Math.floor(value);
}

function maybeScale(value: number, mult: number): number {
  return mult === 1 ? value : applyPokemonRoundHalfDown(value * mult);
}

function resolveKoChanceLabel(
  rolls: readonly number[],
  maxHp: number,
  effectiveness: number,
): string {
  if (effectiveness === 0) return 'Imune (0%)';
  const minDmg = rolls[0] ?? 0;
  const maxDmg = rolls.at(-1) ?? 0;
  if (minDmg >= maxHp) return 'OHKO garantido';
  if (maxDmg >= maxHp) {
    const ohkoRolls = rolls.filter((dmg) => dmg >= maxHp).length;
    return `Chance de OHKO (${Math.round((ohkoRolls / rolls.length) * 100)}%)`;
  }
  if (minDmg * 2 >= maxHp) return '2HKO garantido';
  if (maxDmg * 2 >= maxHp) return 'Chance de 2HKO';
  if (maxDmg * 3 >= maxHp) return '3HKO';
  return '4HKO+';
}

export function calculatePokemonDamage(rawInput: DamageCalculationInput): DamageCalculationResult {
  const input = DamageCalculationInputSchema.parse(rawInput);
  const effectiveness = computeAttackTypeMultiplier(input.moveType, input.defenderTypes);
  const stabApplied = input.attackerTypes.includes(input.moveType);
  if (effectiveness === 0) {
    return {
      rolls: Array.from({ length: 16 }, () => 0),
      minDamage: 0,
      maxDamage: 0,
      minPercent: 0,
      maxPercent: 0,
      stabApplied,
      typeEffectiveness: 0,
      koChanceLabel: 'Imune (0%)',
    };
  }
  const atkStage = input.isCritical && input.attackerStage < 0 ? 0 : input.attackerStage;
  const effectiveAtk = Math.max(1, applyStatStage(input.attackerStat, atkStage));
  const effectiveDef = resolveEffectiveDefense(input);
  const levelTerm = Math.floor((2 * input.attackerLevel) / 5) + 2;
  const baseDamage =
    Math.floor(Math.floor((levelTerm * input.movePower * effectiveAtk) / effectiveDef) / 50) + 2;
  const afterSpread = maybeScale(baseDamage, input.isDoublesSpread ? 0.75 : 1);
  const afterWeather = maybeScale(
    afterSpread,
    resolveWeatherMultiplier(input.weather, input.moveType),
  );
  const afterCrit = maybeScale(afterWeather, input.isCritical ? 1.5 : 1);
  const burnMult = input.isBurned && input.moveCategory === 'physical' ? 0.5 : 1;
  const rolls = Array.from({ length: 16 }, (_, idx) => {
    const rolled = Math.floor((afterCrit * (85 + idx)) / 100);
    const afterStab = maybeScale(rolled, stabApplied ? 1.5 : 1);
    const afterType = Math.floor(afterStab * effectiveness);
    const afterBurn = maybeScale(afterType, burnMult);
    return Math.max(1, maybeScale(afterBurn, input.itemMultiplier));
  });
  const minDamage = rolls[0] ?? 1;
  const maxDamage = rolls.at(-1) ?? 1;
  return {
    rolls,
    minDamage,
    maxDamage,
    minPercent: Number(((minDamage / input.defenderMaxHp) * 100).toFixed(1)),
    maxPercent: Number(((maxDamage / input.defenderMaxHp) * 100).toFixed(1)),
    stabApplied,
    typeEffectiveness: effectiveness,
    koChanceLabel: resolveKoChanceLabel(rolls, input.defenderMaxHp, effectiveness),
  };
}
