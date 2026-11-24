import { POKEMON_TYPES, type PokemonTypeName } from '../constants/platform.constants';

export interface TypeDamageRelationInput {
  readonly typeName: string;
  readonly doubleDamageFrom: readonly string[];
  readonly halfDamageFrom: readonly string[];
  readonly noDamageFrom: readonly string[];
}

export interface DefensiveTypeEffectiveness {
  readonly multipliers: Record<PokemonTypeName, number>;
  readonly quadWeak: readonly PokemonTypeName[];
  readonly weak: readonly PokemonTypeName[];
  readonly neutral: readonly PokemonTypeName[];
  readonly resistant: readonly PokemonTypeName[];
  readonly quadResistant: readonly PokemonTypeName[];
  readonly immune: readonly PokemonTypeName[];
}

const VALID_TYPE_SET: ReadonlySet<string> = new Set(POKEMON_TYPES);

function isPokemonTypeName(value: string): value is PokemonTypeName {
  return VALID_TYPE_SET.has(value);
}

function applyRelationFactor(
  multipliers: Record<PokemonTypeName, number>,
  attackingTypes: readonly string[],
  factor: number,
): void {
  for (const rawType of attackingTypes) {
    const normalized = rawType.trim().toLowerCase();
    if (isPokemonTypeName(normalized)) {
      multipliers[normalized] *= factor;
    }
  }
}

export function computeDefensiveTypeEffectiveness(
  relations: readonly TypeDamageRelationInput[],
): DefensiveTypeEffectiveness {
  const multipliers = Object.fromEntries(POKEMON_TYPES.map((typeName) => [typeName, 1])) as Record<
    PokemonTypeName,
    number
  >;

  const seenDefendingTypes = new Set<string>();
  for (const relation of relations) {
    const normalizedDefending = relation.typeName.trim().toLowerCase();
    if (!normalizedDefending || seenDefendingTypes.has(normalizedDefending)) {
      continue;
    }
    seenDefendingTypes.add(normalizedDefending);
    applyRelationFactor(multipliers, relation.doubleDamageFrom, 2);
    applyRelationFactor(multipliers, relation.halfDamageFrom, 0.5);
    applyRelationFactor(multipliers, relation.noDamageFrom, 0);
  }

  const quadWeak: PokemonTypeName[] = [];
  const weak: PokemonTypeName[] = [];
  const neutral: PokemonTypeName[] = [];
  const resistant: PokemonTypeName[] = [];
  const quadResistant: PokemonTypeName[] = [];
  const immune: PokemonTypeName[] = [];

  for (const attackingType of POKEMON_TYPES) {
    const mult = multipliers[attackingType];
    if (mult === 0) {
      immune.push(attackingType);
    } else if (mult >= 4) {
      quadWeak.push(attackingType);
    } else if (mult >= 2) {
      weak.push(attackingType);
    } else if (mult <= 0.25) {
      quadResistant.push(attackingType);
    } else if (mult < 1) {
      resistant.push(attackingType);
    } else {
      neutral.push(attackingType);
    }
  }

  return {
    multipliers,
    quadWeak,
    weak,
    neutral,
    resistant,
    quadResistant,
    immune,
  };
}
