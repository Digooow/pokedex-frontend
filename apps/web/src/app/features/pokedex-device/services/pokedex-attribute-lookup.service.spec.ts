import { buildAttributeLookupRequests, intersectSets } from './pokedex-attribute-lookup.service';

describe('pokedex-attribute-lookup.service helpers', () => {
  it('returns null when intersecting an empty list or when any lookup set failed (null)', () => {
    expect(intersectSets([])).toBeNull();
    expect(intersectSets([new Set(['pikachu', 'raichu']), null])).toBeNull();
  });

  it('returns the single set as-is or intersects multiple non-null sets', () => {
    const single = new Set(['pikachu', 'charizard']);
    expect(intersectSets([single])).toBe(single);

    const intersected = intersectSets([
      new Set(['pikachu', 'raichu', 'charizard']),
      new Set(['raichu', 'pikachu']),
    ]);
    expect(intersected).not.toBeNull();
    expect(intersected?.size).toBe(2);
    expect(intersected?.has('pikachu')).toBe(true);
    expect(intersected?.has('raichu')).toBe(true);
    expect(intersected?.has('charizard')).toBe(false);
  });

  it('builds lookup requests for move, ability, mapped game, and unenriched egg groups', () => {
    expect(
      buildAttributeLookupRequests({
        moveFilter: 'thunderbolt',
        abilityFilter: 'static',
        game: 'scarlet-violet',
        eggGroup: 'fairy',
        hasEnrichedEggGroups: false,
      }),
    ).toEqual([
      { kind: 'move', slug: 'thunderbolt' },
      { kind: 'ability', slug: 'static' },
      { kind: 'pokedex', slug: 'paldea' },
      { kind: 'eggGroup', slug: 'fairy' },
    ]);

    expect(
      buildAttributeLookupRequests({
        moveFilter: null,
        abilityFilter: null,
        game: 'unknown-game',
        eggGroup: 'fairy',
        hasEnrichedEggGroups: true,
      }),
    ).toEqual([]);
  });
});
