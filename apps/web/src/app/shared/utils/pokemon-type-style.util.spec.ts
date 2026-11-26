import { POKEMON_TYPES } from '@pokeverse/shared';
import { extractPokemonTypeFromBadge, resolvePokemonTypeSlug } from './pokemon-type-style.util';

describe('pokemon-type-style.util', () => {
  it('resolves all 18 canonical Pokémon types case-insensitively and trimmed', () => {
    for (const typeName of POKEMON_TYPES) {
      expect(resolvePokemonTypeSlug(typeName)).toBe(typeName);
      expect(resolvePokemonTypeSlug(`  ${typeName.toUpperCase()}  `)).toBe(typeName);
    }
  });

  it('returns null for unknown, empty, or nullish type inputs', () => {
    expect(resolvePokemonTypeSlug(null)).toBeNull();
    expect(resolvePokemonTypeSlug(undefined)).toBeNull();
    expect(resolvePokemonTypeSlug('')).toBeNull();
    expect(resolvePokemonTypeSlug('   ')).toBeNull();
    expect(resolvePokemonTypeSlug('shadow')).toBeNull();
  });

  it('extracts Pokémon types from direct labels and encyclopedia damage-relation badges', () => {
    expect(extractPokemonTypeFromBadge('Electric')).toBe('electric');
    expect(extractPokemonTypeFromBadge('2x em Grass')).toBe('grass');
    expect(extractPokemonTypeFromBadge('2x de Ground')).toBe('ground');
    expect(extractPokemonTypeFromBadge('0.5x em Steel')).toBe('steel');
    expect(extractPokemonTypeFromBadge('Physical')).toBeNull();
    expect(extractPokemonTypeFromBadge('Generation I')).toBeNull();
    expect(extractPokemonTypeFromBadge('+10% Attack')).toBeNull();
  });
});
