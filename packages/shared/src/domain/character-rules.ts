import {
  CHARACTER_ATTRIBUTE_KEYS,
  CHARACTER_BASE_ATTRIBUTE,
  CHARACTER_ORIGINS,
  type CharacterAttributeAllocation,
  type CharacterAttributes,
  type CharacterOriginKey,
  type CharacterOriginSpec,
} from './character-presets';

export interface CharacterDerivedVitals {
  readonly hpMax: number;
  readonly staminaMax: number;
  readonly manaMax: number;
  readonly hungerMax: number;
  readonly thirstMax: number;
  readonly fatigueMax: number;
  readonly carryCapacityKg: number;
  readonly baseDodgeRating: number;
  readonly baseDetectionRadius: number;
  readonly curseResistanceBase: number;
  readonly companionSlots: number;
}

export function sanitizeCharacterDisplayName(raw: string): string {
  return raw.trim().replaceAll(/\s+/g, ' ');
}

export function normalizeCharacterName(raw: string): string {
  return sanitizeCharacterDisplayName(raw).toLowerCase();
}

export function sumAttributeAllocation(allocation: CharacterAttributeAllocation): number {
  let total = 0;
  for (const key of CHARACTER_ATTRIBUTE_KEYS) {
    total += allocation[key];
  }
  return total;
}

export function buildInitialAttributes(
  allocation: CharacterAttributeAllocation,
): CharacterAttributes {
  return {
    physique: CHARACTER_BASE_ATTRIBUTE + allocation.physique,
    dexterity: CHARACTER_BASE_ATTRIBUTE + allocation.dexterity,
    stamina: CHARACTER_BASE_ATTRIBUTE + allocation.stamina,
    magic: CHARACTER_BASE_ATTRIBUTE + allocation.magic,
    perception: CHARACTER_BASE_ATTRIBUTE + allocation.perception,
    willpower: CHARACTER_BASE_ATTRIBUTE + allocation.willpower,
    handling: CHARACTER_BASE_ATTRIBUTE + allocation.handling,
  };
}

export function getCharacterOriginByKey(key: CharacterOriginKey): CharacterOriginSpec {
  for (const origin of CHARACTER_ORIGINS) {
    if (origin.key === key) {
      return origin;
    }
  }
  const fallback = CHARACTER_ORIGINS[0];
  if (!fallback) {
    throw new Error('CHARACTER_ORIGINS must contain at least one origin.');
  }
  return fallback;
}

export function computeStarterKitWeightKg(originKey: CharacterOriginKey): number {
  const origin = getCharacterOriginByKey(originKey);
  const sum = origin.starterKit.reduce((acc, item) => acc + item.weightKg, 0);
  return Number(sum.toFixed(1));
}

export function computeCharacterDerivedVitals(
  level: number,
  attributes: CharacterAttributes,
): CharacterDerivedVitals {
  const levelSteps = Math.max(0, level - 1);
  return {
    hpMax: 80 + attributes.stamina * 12 + attributes.physique * 4 + levelSteps * 10,
    staminaMax: 60 + attributes.stamina * 10 + attributes.dexterity * 3 + levelSteps * 5,
    manaMax: 30 + attributes.magic * 12 + attributes.willpower * 4 + levelSteps * 6,
    hungerMax: 100,
    thirstMax: 100,
    fatigueMax: 100,
    carryCapacityKg: Number((20 + attributes.physique * 3.5 + attributes.stamina * 1.2).toFixed(1)),
    baseDodgeRating: Math.round(attributes.dexterity * 2.5 + attributes.perception * 0.8),
    baseDetectionRadius: Number((4 + attributes.perception * 0.6).toFixed(1)),
    curseResistanceBase: Math.round(attributes.willpower * 3 + attributes.stamina * 0.5),
    companionSlots: Math.min(6, 1 + Math.floor(attributes.handling / 6)),
  };
}

export function buildCharacterVitalsState(params: {
  readonly originKey: CharacterOriginKey;
  readonly derived: CharacterDerivedVitals;
  readonly current?: {
    readonly hpCurrent: number;
    readonly staminaCurrent: number;
    readonly manaCurrent: number;
    readonly hungerCurrent: number;
    readonly thirstCurrent: number;
    readonly fatigueCurrent: number;
  };
}) {
  return {
    hpCurrent: params.current?.hpCurrent ?? params.derived.hpMax,
    hpMax: params.derived.hpMax,
    staminaCurrent: params.current?.staminaCurrent ?? params.derived.staminaMax,
    staminaMax: params.derived.staminaMax,
    manaCurrent: params.current?.manaCurrent ?? params.derived.manaMax,
    manaMax: params.derived.manaMax,
    hungerCurrent: params.current?.hungerCurrent ?? params.derived.hungerMax,
    hungerMax: 100 as const,
    thirstCurrent: params.current?.thirstCurrent ?? params.derived.thirstMax,
    thirstMax: 100 as const,
    fatigueCurrent: params.current?.fatigueCurrent ?? 0,
    fatigueMax: 100 as const,
    carryCapacityKg: params.derived.carryCapacityKg,
    starterKitWeightKg: computeStarterKitWeightKg(params.originKey),
    baseDodgeRating: params.derived.baseDodgeRating,
    baseDetectionRadius: params.derived.baseDetectionRadius,
    curseResistanceBase: params.derived.curseResistanceBase,
    companionSlots: params.derived.companionSlots,
  };
}
