import * as z from 'zod';
import { MAX_EV_PER_STAT, MAX_EV_TOTAL } from '../constants/platform.constants';

export const GrowthRateSchema = z.enum([
  'slow',
  'medium',
  'fast',
  'medium-slow',
  'erratic',
  'fluctuating',
]);

export type GrowthRate = z.infer<typeof GrowthRateSchema>;

export const BaseStatsSpreadSchema = z.object({
  hp: z.number().int().min(1).max(255),
  attack: z.number().int().min(1).max(255),
  defense: z.number().int().min(1).max(255),
  specialAttack: z.number().int().min(1).max(255),
  specialDefense: z.number().int().min(1).max(255),
  speed: z.number().int().min(1).max(255),
});

export type BaseStatsSpread = z.infer<typeof BaseStatsSpreadSchema>;

export const StatIvSpreadSchema = z.object({
  hp: z.number().int().min(0).max(31).default(31),
  attack: z.number().int().min(0).max(31).default(31),
  defense: z.number().int().min(0).max(31).default(31),
  specialAttack: z.number().int().min(0).max(31).default(31),
  specialDefense: z.number().int().min(0).max(31).default(31),
  speed: z.number().int().min(0).max(31).default(31),
});

export const StatEvSpreadSchema = z
  .object({
    hp: z.number().int().min(0).max(MAX_EV_PER_STAT).default(0),
    attack: z.number().int().min(0).max(MAX_EV_PER_STAT).default(0),
    defense: z.number().int().min(0).max(MAX_EV_PER_STAT).default(0),
    specialAttack: z.number().int().min(0).max(MAX_EV_PER_STAT).default(0),
    specialDefense: z.number().int().min(0).max(MAX_EV_PER_STAT).default(0),
    speed: z.number().int().min(0).max(MAX_EV_PER_STAT).default(0),
  })
  .refine(
    (ev) => ev.hp + ev.attack + ev.defense + ev.specialAttack + ev.specialDefense + ev.speed <= MAX_EV_TOTAL,
    { message: 'Total EVs cannot exceed 510.' },
  );

export const NatureMultiplierSchema = z.union([z.literal(0.9), z.literal(1), z.literal(1.1)]);

export const NatureModifiersSchema = z.object({
  attack: NatureMultiplierSchema.default(1),
  defense: NatureMultiplierSchema.default(1),
  specialAttack: NatureMultiplierSchema.default(1),
  specialDefense: NatureMultiplierSchema.default(1),
  speed: NatureMultiplierSchema.default(1),
});

export const StatCalculationInputSchema = z.object({
  level: z.number().int().min(1).max(100),
  baseStats: BaseStatsSpreadSchema,
  ivs: StatIvSpreadSchema.default({ hp: 31, attack: 31, defense: 31, specialAttack: 31, specialDefense: 31, speed: 31 }),
  evs: StatEvSpreadSchema.default({ hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 }),
  natureModifiers: NatureModifiersSchema.default({ attack: 1, defense: 1, specialAttack: 1, specialDefense: 1, speed: 1 }),
  ascensionBonusPercent: z.number().min(0).max(12).default(0),
});

export type StatCalculationInput = z.input<typeof StatCalculationInputSchema>;

export interface CalculatedStatsResult extends BaseStatsSpread {
  readonly totalPower: number;
}

export function calculateXpForLevel(level: number, growthRate: GrowthRate): number {
  const n = Math.max(1, Math.min(100, Math.floor(level)));
  if (n <= 1) {
    return 0;
  }

  const cube = n * n * n;
  switch (growthRate) {
    case 'fast':
      return Math.floor((4 * cube) / 5);
    case 'medium':
      return cube;
    case 'slow':
      return Math.floor((5 * cube) / 4);
    case 'medium-slow':
      return Math.max(0, Math.floor((6 / 5) * cube - 15 * n * n + 100 * n - 140));
    case 'erratic':
      if (n < 50) return Math.floor((cube * (100 - n)) / 50);
      if (n < 68) return Math.floor((cube * (150 - n)) / 100);
      if (n < 98) return Math.floor((cube * Math.floor((1911 - 10 * n) / 3)) / 500);
      return Math.floor((cube * (160 - n)) / 100);
    case 'fluctuating':
      if (n < 15) return Math.floor((cube * (Math.floor((n + 1) / 3) + 24)) / 50);
      if (n < 36) return Math.floor((cube * (n + 14)) / 50);
      return Math.floor((cube * (Math.floor(n / 2) + 32)) / 50);
  }
}

function computeNonHpStat(
  base: number,
  iv: number,
  ev: number,
  level: number,
  natureMult: number,
  ascensionScale: number,
): number {
  const preNature = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  const withNature = Math.floor(preNature * natureMult);
  return Math.floor(withNature * ascensionScale);
}

export function calculateStatsAtLevel(rawInput: StatCalculationInput): CalculatedStatsResult {
  const input = StatCalculationInputSchema.parse(rawInput);
  const { level, baseStats, ivs, evs, natureModifiers, ascensionBonusPercent } = input;
  const ascensionScale = 1 + ascensionBonusPercent / 100;

  const baseHp =
    baseStats.hp === 1
      ? 1
      : Math.floor(((2 * baseStats.hp + ivs.hp + Math.floor(evs.hp / 4)) * level) / 100) + level + 10;
  const hp = baseStats.hp === 1 ? 1 : Math.floor(baseHp * ascensionScale);

  const attack = computeNonHpStat(baseStats.attack, ivs.attack, evs.attack, level, natureModifiers.attack, ascensionScale);
  const defense = computeNonHpStat(baseStats.defense, ivs.defense, evs.defense, level, natureModifiers.defense, ascensionScale);
  const specialAttack = computeNonHpStat(
    baseStats.specialAttack,
    ivs.specialAttack,
    evs.specialAttack,
    level,
    natureModifiers.specialAttack,
    ascensionScale,
  );
  const specialDefense = computeNonHpStat(
    baseStats.specialDefense,
    ivs.specialDefense,
    evs.specialDefense,
    level,
    natureModifiers.specialDefense,
    ascensionScale,
  );
  const speed = computeNonHpStat(baseStats.speed, ivs.speed, evs.speed, level, natureModifiers.speed, ascensionScale);

  return {
    hp,
    attack,
    defense,
    specialAttack,
    specialDefense,
    speed,
    totalPower: hp + attack + defense + specialAttack + specialDefense + speed,
  };
}

export const EvolutionReadinessInputSchema = z.object({
  currentLevel: z.number().int().min(1).max(100),
  requiredLevel: z.number().int().min(1).max(100).nullable().default(null),
  happiness: z.number().int().min(0).max(255).default(70),
  requiredHappiness: z.number().int().min(0).max(255).nullable().default(null),
  hasRequiredItem: z.boolean().default(true),
  requiredItemName: z.string().trim().max(64).nullable().default(null),
  catalystBoostPercent: z.number().min(0).max(30).default(0),
  timeOfDay: z.enum(['day', 'night', 'dusk']).default('day'),
  requiredTimeOfDay: z.enum(['day', 'night', 'dusk']).nullable().default(null),
  weather: z.enum(['clear', 'rain', 'sun', 'sand', 'snow']).default('clear'),
  requiredWeather: z.enum(['clear', 'rain', 'sun', 'sand', 'snow']).nullable().default(null),
  knownMoveMatches: z.boolean().default(true),
  biomeStability: z.number().min(0).max(100).default(80),
  geneticResonance: z.number().min(0).max(100).default(50),
});

export type EvolutionReadinessInput = z.input<typeof EvolutionReadinessInputSchema>;

export interface EvolutionEvaluationResult {
  readonly canEvolve: boolean;
  readonly probabilityPercent: number;
  readonly missingRequirements: readonly string[];
  readonly recommendedCatalyst: string;
}

export function evaluateEvolutionChance(rawInput: EvolutionReadinessInput): EvolutionEvaluationResult {
  const input = EvolutionReadinessInputSchema.parse(rawInput);
  const missing: string[] = [];

  if (input.requiredLevel !== null && input.currentLevel < input.requiredLevel) {
    missing.push(`Nível mínimo ${input.requiredLevel} (atual ${input.currentLevel})`);
  }
  if (input.requiredHappiness !== null && input.happiness < input.requiredHappiness) {
    missing.push(`Felicidade mínima ${input.requiredHappiness} (atual ${input.happiness})`);
  }
  if (!input.hasRequiredItem) {
    missing.push(`Item catalisador ausente (${input.requiredItemName ?? 'Pedra / Item evolutivo'})`);
  }
  if (input.requiredTimeOfDay !== null && input.timeOfDay !== input.requiredTimeOfDay) {
    missing.push(`Janela temporal exigida: ${input.requiredTimeOfDay}`);
  }
  if (input.requiredWeather !== null && input.weather !== input.requiredWeather) {
    missing.push(`Clima exigido: ${input.requiredWeather}`);
  }
  if (!input.knownMoveMatches) {
    missing.push('Golpe pré-requisito ainda não aprendido');
  }

  const readinessPenalty = missing.length * 25;
  const baseChance = 55 + input.biomeStability * 0.25 + input.geneticResonance * 0.2 + input.catalystBoostPercent;
  const rawProbability = Math.round(Math.max(0, Math.min(100, baseChance - readinessPenalty)) * 100) / 100;
  const canEvolve = missing.length === 0;

  let recommendedCatalyst = 'Estabilizador Genético Padrão';
  if (!input.hasRequiredItem && input.requiredItemName) {
    recommendedCatalyst = input.requiredItemName;
  } else if (input.requiredHappiness !== null && input.happiness < input.requiredHappiness) {
    recommendedCatalyst = 'Soothe Bell + Berries de Afeto';
  } else if (input.geneticResonance < 60) {
    recommendedCatalyst = 'Bio-Essência da Espécie';
  }

  return {
    canEvolve,
    probabilityPercent: canEvolve ? rawProbability : Math.min(49, rawProbability),
    missingRequirements: missing,
    recommendedCatalyst,
  };
}

export const ReplicationCloningInputSchema = z.object({
  baseStatTotal: z.number().int().min(100).max(1200),
  rarityTier: z.enum(['standard', 'pseudo-legendary', 'legendary', 'mythical']),
  labTier: z.number().int().min(1).max(5).default(1),
  stabilizerCount: z.number().int().min(0).max(3).default(0),
  sourceIvPerfectCount: z.number().int().min(0).max(6).default(0),
});

export type ReplicationCloningInput = z.input<typeof ReplicationCloningInputSchema>;

export interface ReplicationCloningResult {
  readonly replicationSuccessPercent: number;
  readonly cloningFidelityPercent: number;
  readonly guaranteedPerfectIvs: number;
  readonly mutationRiskPercent: number;
  readonly shinyMutationChancePercent: number;
  readonly bioEnergyCost: number;
}

const RARITY_PENALTY: Record<'standard' | 'pseudo-legendary' | 'legendary' | 'mythical', number> = {
  standard: 0,
  'pseudo-legendary': 16,
  legendary: 34,
  mythical: 42,
};

const RARITY_COST_MULTIPLIER: Record<'standard' | 'pseudo-legendary' | 'legendary' | 'mythical', number> = {
  standard: 1,
  'pseudo-legendary': 1.8,
  legendary: 3.2,
  mythical: 4,
};

export function calculateReplicationAndCloning(rawInput: ReplicationCloningInput): ReplicationCloningResult {
  const input = ReplicationCloningInputSchema.parse(rawInput);
  const bstPenalty = Math.max(0, Math.floor((input.baseStatTotal - 300) / 25));
  const labBonus = (input.labTier - 1) * 9;
  const stabilizerBonus = input.stabilizerCount * 8;
  const rarityPenalty = RARITY_PENALTY[input.rarityTier];

  const replicationSuccessPercent = Math.max(
    12,
    Math.min(99, 78 + labBonus + stabilizerBonus - rarityPenalty - bstPenalty),
  );
  const cloningFidelityPercent = Math.max(
    25,
    Math.min(100, 62 + input.labTier * 6 + input.stabilizerCount * 5 - Math.floor(rarityPenalty / 2)),
  );
  const guaranteedPerfectIvs = Math.min(
    input.sourceIvPerfectCount,
    Math.min(6, Math.floor(input.labTier / 2) + input.stabilizerCount),
  );
  const mutationRiskPercent = Math.max(
    1,
    Math.min(65, 18 + Math.floor(rarityPenalty / 2) - input.stabilizerCount * 5 - (input.labTier - 1) * 2),
  );
  const shinyMutationChancePercent = Number(
    Math.min(15, 0.25 + input.labTier * 0.35 + input.stabilizerCount * 0.2 + (input.rarityTier === 'mythical' ? 1 : 0)).toFixed(2),
  );
  const bioEnergyCost = Math.round(input.baseStatTotal * RARITY_COST_MULTIPLIER[input.rarityTier]);

  return {
    replicationSuccessPercent,
    cloningFidelityPercent,
    guaranteedPerfectIvs,
    mutationRiskPercent,
    shinyMutationChancePercent,
    bioEnergyCost,
  };
}

export const SpeciesAscensionInputSchema = z.object({
  recycledSameSpeciesCount: z.number().int().min(0).max(500).default(0),
  recycledEggGroupCount: z.number().int().min(0).max(500).default(0),
  averageSpecimenLevel: z.number().int().min(1).max(100).default(1),
  shinyRecycledCount: z.number().int().min(0).max(50).default(0),
  existingEssence: z.number().int().min(0).max(10_000).default(0),
});

export type SpeciesAscensionInput = z.input<typeof SpeciesAscensionInputSchema>;

export type AscensionRank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'APEX';

export interface SpeciesAscensionResult {
  readonly bioEssenceGained: number;
  readonly totalEssence: number;
  readonly rank: AscensionRank;
  readonly statResonanceBonusPercent: number;
  readonly ivHyperTrainTokens: number;
  readonly apexSpeciesEvolutionUnlocked: boolean;
}

function resolveAscensionRank(totalEssence: number): AscensionRank {
  if (totalEssence >= 500) return 'APEX';
  if (totalEssence >= 320) return 'S';
  if (totalEssence >= 200) return 'A';
  if (totalEssence >= 120) return 'B';
  if (totalEssence >= 60) return 'C';
  if (totalEssence >= 20) return 'D';
  return 'E';
}

export function calculateSpeciesAscension(rawInput: SpeciesAscensionInput): SpeciesAscensionResult {
  const input = SpeciesAscensionInputSchema.parse(rawInput);
  const levelFactor = 1 + input.averageSpecimenLevel / 100;
  const sameSpeciesYield = Math.round(input.recycledSameSpeciesCount * 12 * levelFactor);
  const eggGroupYield = Math.round(input.recycledEggGroupCount * 4 * levelFactor);
  const shinyBonus = input.shinyRecycledCount * 45;

  const bioEssenceGained = sameSpeciesYield + eggGroupYield + shinyBonus;
  const totalEssence = input.existingEssence + bioEssenceGained;
  const rank = resolveAscensionRank(totalEssence);
  const statResonanceBonusPercent = Number(Math.min(12, Math.floor(totalEssence / 42)).toFixed(2));
  const ivHyperTrainTokens = Math.floor(totalEssence / 100);
  const apexSpeciesEvolutionUnlocked = totalEssence >= 500;

  return {
    bioEssenceGained,
    totalEssence,
    rank,
    statResonanceBonusPercent,
    ivHyperTrainTokens,
    apexSpeciesEvolutionUnlocked,
  };
}
