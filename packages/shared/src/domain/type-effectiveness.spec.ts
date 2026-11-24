import { describe, expect, it } from 'vitest';
import { computeDefensiveTypeEffectiveness } from './type-effectiveness';

describe('computeDefensiveTypeEffectiveness', () => {
  it('computes single-type effectiveness accurately', () => {
    const result = computeDefensiveTypeEffectiveness([
      {
        typeName: 'electric',
        doubleDamageFrom: ['ground'],
        halfDamageFrom: ['flying', 'steel', 'electric'],
        noDamageFrom: [],
      },
    ]);

    expect(result.weak).toEqual(['ground']);
    expect(result.resistant).toEqual(['electric', 'flying', 'steel']);
    expect(result.quadWeak).toEqual([]);
    expect(result.quadResistant).toEqual([]);
    expect(result.immune).toEqual([]);
    expect(result.multipliers.ground).toBe(2);
    expect(result.multipliers.electric).toBe(0.5);
    expect(result.multipliers.normal).toBe(1);
  });

  it('computes dual-type 4x, 0.25x, 0x, and 2x * 0.5x = 1x cancellations', () => {
    const result = computeDefensiveTypeEffectiveness([
      {
        typeName: 'fire',
        doubleDamageFrom: ['water', 'ground', 'rock'],
        halfDamageFrom: ['fire', 'grass', 'ice', 'bug', 'steel', 'fairy'],
        noDamageFrom: [],
      },
      {
        typeName: 'flying',
        doubleDamageFrom: ['electric', 'ice', 'rock'],
        halfDamageFrom: ['grass', 'fighting', 'bug'],
        noDamageFrom: ['ground'],
      },
    ]);

    expect(result.quadWeak).toEqual(['rock']);
    expect(result.weak).toEqual(['water', 'electric']);
    expect(result.quadResistant).toEqual(['grass', 'bug']);
    expect(result.resistant).toEqual(['fire', 'fighting', 'steel', 'fairy']);
    expect(result.immune).toEqual(['ground']);
    expect(result.multipliers.ice).toBe(1);
    expect(result.neutral).toContain('ice');
  });

  it('handles immunity overriding weakness, empty inputs, duplicate types, and non-standard types', () => {
    const ghostNormal = computeDefensiveTypeEffectiveness([
      {
        typeName: 'normal',
        doubleDamageFrom: ['fighting'],
        halfDamageFrom: [],
        noDamageFrom: ['ghost'],
      },
      {
        typeName: 'ghost',
        doubleDamageFrom: ['ghost', 'dark'],
        halfDamageFrom: ['poison', 'bug'],
        noDamageFrom: ['normal', 'fighting'],
      },
      {
        typeName: 'ghost',
        doubleDamageFrom: ['ghost', 'dark'],
        halfDamageFrom: ['poison', 'bug'],
        noDamageFrom: ['normal', 'fighting'],
      },
      {
        typeName: 'unknown',
        doubleDamageFrom: ['stellar'],
        halfDamageFrom: [],
        noDamageFrom: [],
      },
    ]);

    expect(ghostNormal.immune).toEqual(['normal', 'fighting', 'ghost']);
    expect(ghostNormal.weak).toEqual(['dark']);
    expect(ghostNormal.multipliers.fighting).toBe(0);
    expect(ghostNormal.multipliers.dark).toBe(2);

    const empty = computeDefensiveTypeEffectiveness([]);
    expect(empty.neutral).toHaveLength(18);
    expect(empty.weak).toEqual([]);
  });
});
