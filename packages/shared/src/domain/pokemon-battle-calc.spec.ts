import { describe, expect, it } from 'vitest';
import { calculatePokemonDamage, computeAttackTypeMultiplier } from './pokemon-battle-calc';
import {
  COMPETITIVE_SPREAD_PRESETS,
  POKEMON_NATURES,
  formatShowdownSpread,
  parseShowdownSpread,
} from './pokemon-showdown-spread';

describe('Competitive Battle Calculator & Showdown Spread Engine', () => {
  it('registers all 25 official natures and valid Smogon/VGC presets', () => {
    expect(POKEMON_NATURES).toHaveLength(25);
    expect(POKEMON_NATURES.slice(0, 5).map((entry) => entry.key)).toEqual([
      'hardy',
      'docile',
      'serious',
      'bashful',
      'quirky',
    ]);
    expect(POKEMON_NATURES.find((entry) => entry.key === 'lonely')).toEqual({
      key: 'lonely',
      label: 'Lonely (+Atk, -Def)',
      up: 'attack',
      down: 'defense',
    });
    expect(POKEMON_NATURES.find((entry) => entry.key === 'adamant')).toEqual({
      key: 'adamant',
      label: 'Adamant (+Atk, -SpA)',
      up: 'attack',
      down: 'specialAttack',
    });
    expect(POKEMON_NATURES.find((entry) => entry.key === 'timid')).toEqual({
      key: 'timid',
      label: 'Timid (+Spe, -Atk)',
      up: 'speed',
      down: 'attack',
    });
    expect(POKEMON_NATURES.find((entry) => entry.key === 'modest')).toEqual({
      key: 'modest',
      label: 'Modest (+SpA, -Atk)',
      up: 'specialAttack',
      down: 'attack',
    });
    expect(POKEMON_NATURES.find((entry) => entry.key === 'careful')).toEqual({
      key: 'careful',
      label: 'Careful (+SpD, -SpA)',
      up: 'specialDefense',
      down: 'specialAttack',
    });
    expect(COMPETITIVE_SPREAD_PRESETS).toHaveLength(8);
    for (const preset of COMPETITIVE_SPREAD_PRESETS) {
      const evSum =
        preset.evs.hp +
        preset.evs.attack +
        preset.evs.defense +
        preset.evs.specialAttack +
        preset.evs.specialDefense +
        preset.evs.speed;
      expect(evSum).toBeLessThanOrEqual(510);
      expect(POKEMON_NATURES.some((n) => n.key === preset.natureKey)).toBe(true);
    }
  });

  it('computes Gen VI-IX offensive type multipliers including 4x, 0.25x, and 0x immunities', () => {
    expect(computeAttackTypeMultiplier('electric', ['water', 'flying'])).toBe(4);
    expect(computeAttackTypeMultiplier('electric', ['ground'])).toBe(0);
    expect(computeAttackTypeMultiplier('fighting', ['normal', 'ghost'])).toBe(0);
    expect(computeAttackTypeMultiplier('grass', ['fire', 'steel'])).toBe(0.25);
    expect(computeAttackTypeMultiplier('fairy', ['dragon', 'dark'])).toBe(4);
  });

  it('calculates deterministic Gen V-IX damage rolls with STAB, crits, weather, burn, and KO label', () => {
    const stabRain = calculatePokemonDamage({
      attackerLevel: 50,
      attackerStat: 160,
      defenderStat: 110,
      defenderMaxHp: 170,
      movePower: 90,
      moveCategory: 'special',
      moveType: 'water',
      attackerTypes: ['water'],
      defenderTypes: ['fire', 'rock'],
      weather: 'rain',
      itemMultiplier: 1.3,
    });
    expect(stabRain.stabApplied).toBe(true);
    expect(stabRain.typeEffectiveness).toBe(4);
    expect(stabRain.rolls).toHaveLength(16);
    expect(stabRain.rolls[0]).toBeLessThanOrEqual(stabRain.rolls[15] ?? 0);
    expect(stabRain.koChanceLabel).toBe('OHKO garantido');

    const critIgnoresDrops = calculatePokemonDamage({
      attackerLevel: 50,
      attackerStat: 150,
      defenderStat: 120,
      defenderMaxHp: 200,
      movePower: 80,
      moveCategory: 'physical',
      moveType: 'normal',
      attackerTypes: ['normal'],
      defenderTypes: ['normal'],
      isCritical: true,
      attackerStage: -2,
      defenderStage: 2,
    });
    const neutralNormal = calculatePokemonDamage({
      attackerLevel: 50,
      attackerStat: 150,
      defenderStat: 120,
      defenderMaxHp: 200,
      movePower: 80,
      moveCategory: 'physical',
      moveType: 'normal',
      attackerTypes: ['normal'],
      defenderTypes: ['normal'],
      isCritical: false,
    });
    expect(critIgnoresDrops.maxDamage).toBeGreaterThan(neutralNormal.maxDamage);

    const burnedPhysical = calculatePokemonDamage({
      attackerLevel: 50,
      attackerStat: 150,
      defenderStat: 100,
      defenderMaxHp: 200,
      movePower: 100,
      moveCategory: 'physical',
      moveType: 'fighting',
      attackerTypes: ['fighting'],
      defenderTypes: ['normal'],
      isBurned: true,
    });
    const unburnedPhysical = calculatePokemonDamage({
      attackerLevel: 50,
      attackerStat: 150,
      defenderStat: 100,
      defenderMaxHp: 200,
      movePower: 100,
      moveCategory: 'physical',
      moveType: 'fighting',
      attackerTypes: ['fighting'],
      defenderTypes: ['normal'],
      isBurned: false,
    });
    expect(burnedPhysical.maxDamage).toBeLessThan(unburnedPhysical.maxDamage);

    const immuneResult = calculatePokemonDamage({
      attackerLevel: 50,
      attackerStat: 180,
      defenderStat: 100,
      defenderMaxHp: 180,
      movePower: 120,
      moveCategory: 'special',
      moveType: 'psychic',
      attackerTypes: ['psychic'],
      defenderTypes: ['dark'],
    });
    expect(immuneResult.maxDamage).toBe(0);
    expect(immuneResult.koChanceLabel).toBe('Imune (0%)');
  });

  it('formats and parses Showdown spreads with clamping warnings and validation errors', () => {
    const exported = formatShowdownSpread({
      pokemonName: 'Pikachu',
      level: 50,
      natureKey: 'timid',
      ivs: { hp: 31, attack: 0, defense: 31, specialAttack: 31, specialDefense: 31, speed: 31 },
      evs: { hp: 4, attack: 0, defense: 0, specialAttack: 252, specialDefense: 0, speed: 252 },
    });
    expect(exported).toContain('Pikachu');
    expect(exported).toContain('Level: 50');
    expect(exported).toContain('EVs: 4 HP / 252 SpA / 252 Spe');
    expect(exported).toContain('Timid Nature');
    expect(exported).toContain('IVs: 0 Atk');

    const roundTrip = parseShowdownSpread(exported);
    expect(roundTrip.ok).toBe(true);
    if (roundTrip.ok) {
      expect(roundTrip.data.level).toBe(50);
      expect(roundTrip.data.natureKey).toBe('timid');
      expect(roundTrip.data.evs.specialAttack).toBe(252);
      expect(roundTrip.data.ivs.attack).toBe(0);
      expect(roundTrip.warnings).toHaveLength(0);
    }

    const clamped = parseShowdownSpread(
      'Garchomp @ Choice Scarf\nLevel: 120\nEVs: 252 Atk / 252 Spe / 40 HP\nJolly Nature',
    );
    expect(clamped.ok).toBe(true);
    if (clamped.ok) {
      expect(clamped.data.level).toBe(100);
      expect(clamped.data.evs.hp).toBe(6);
      expect(clamped.warnings.length).toBeGreaterThan(0);
    }

    const empty = parseShowdownSpread('   ');
    expect(empty.ok).toBe(false);
    const garbage = parseShowdownSpread('pikachu @ light ball');
    expect(garbage.ok).toBe(false);
  });
});
