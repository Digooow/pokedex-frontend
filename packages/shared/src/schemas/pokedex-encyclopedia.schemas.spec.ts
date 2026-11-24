import { describe, expect, it } from 'vitest';
import {
  CachedAbilityDetailResponseSchema,
  CachedBerryDetailResponseSchema,
  CachedEggGroupDetailResponseSchema,
  CachedEncyclopediaListResponseSchema,
  CachedGrowthRateDetailResponseSchema,
  CachedItemDetailResponseSchema,
  CachedLocationDetailResponseSchema,
  CachedMoveDetailResponseSchema,
  CachedNaturesListResponseSchema,
  CachedPokedexDetailResponseSchema,
  CachedRegionDetailResponseSchema,
  CachedTypesListResponseSchema,
  EncyclopediaPaginationQuerySchema,
} from '../encyclopedia';

const ARTWORK_URL =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png';

describe('pokedex encyclopedia schemas', () => {
  it('coerces bounded pagination query parameters and rejects out-of-range inputs', () => {
    expect(EncyclopediaPaginationQuerySchema.parse({})).toEqual({
      limit: 24,
      offset: 0,
      q: '',
    });

    expect(
      EncyclopediaPaginationQuerySchema.parse({
        limit: '',
        offset: '',
        q: '  thunder  ',
      }),
    ).toEqual({
      limit: 24,
      offset: 0,
      q: 'thunder',
    });

    expect(
      EncyclopediaPaginationQuerySchema.parse({
        limit: '10',
        offset: '20',
        q: '25',
      }),
    ).toEqual({
      limit: 10,
      offset: 20,
      q: '25',
    });

    for (const invalid of [
      { limit: '0' },
      { limit: '101' },
      { offset: '-1' },
      { offset: '10001' },
      { limit: 'abc' },
      { limit: '1.5' },
      { offset: 'NaN' },
    ]) {
      expect(EncyclopediaPaginationQuerySchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('validates combat encyclopedia responses and enforces HTTPS URLs', () => {
    expect(
      CachedEncyclopediaListResponseSchema.parse({
        cache: 'hit',
        resource: 'move',
        total: 1,
        limit: 24,
        offset: 0,
        hasMore: false,
        items: [{ id: 85, name: 'thunderbolt' }],
      }).items,
    ).toHaveLength(1);

    expect(
      CachedMoveDetailResponseSchema.parse({
        cache: 'miss',
        move: {
          id: 85,
          name: 'thunderbolt',
          type: 'electric',
          damageClass: 'special',
          power: 90,
          accuracy: 100,
          pp: 15,
          priority: 0,
          effectChance: 10,
          target: 'selected-pokemon',
          generation: 'generation-i',
          ailment: 'paralysis',
          category: 'damage+ailment',
          statChanges: [],
          shortEffect: 'Has a 10% chance to paralyze the target.',
          effect: 'Inflicts regular damage.',
          flavorTexts: [
            { language: 'en', versionGroup: 'red-blue', text: 'A strong electric attack.' },
          ],
          learnedByPokemon: [{ pokemonId: 25, pokemonName: 'pikachu', artworkUrl: ARTWORK_URL }],
        },
      }).move.name,
    ).toBe('thunderbolt');

    expect(
      CachedAbilityDetailResponseSchema.parse({
        cache: 'hit',
        ability: {
          id: 9,
          name: 'static',
          isMainSeries: true,
          generation: 'generation-iii',
          shortEffect: 'Paralyzes on contact.',
          effect: '30% chance to paralyze.',
          flavorTexts: [],
          pokemon: [
            {
              pokemonId: 25,
              pokemonName: 'pikachu',
              artworkUrl: ARTWORK_URL,
              isHidden: false,
              slot: 1,
            },
          ],
        },
      }).ability.name,
    ).toBe('static');

    expect(
      CachedNaturesListResponseSchema.parse({
        cache: 'miss',
        total: 1,
        natures: [
          {
            id: 1,
            name: 'hardy',
            increasedStat: null,
            decreasedStat: null,
            likesFlavor: null,
            hatesFlavor: null,
            isNeutral: true,
          },
        ],
      }).natures[0]?.isNeutral,
    ).toBe(true);

    expect(
      CachedTypesListResponseSchema.parse({
        cache: 'hit',
        total: 1,
        types: [
          {
            id: 13,
            name: 'electric',
            generation: 'generation-i',
            moveDamageClass: 'special',
            damageRelations: {
              doubleDamageFrom: ['ground'],
              halfDamageFrom: ['flying', 'steel', 'electric'],
              noDamageFrom: [],
              doubleDamageTo: ['flying', 'water'],
              halfDamageTo: ['grass', 'electric', 'dragon'],
              noDamageTo: ['ground'],
            },
            pokemonCount: 1,
            moveCount: 1,
          },
        ],
      }).types[0]?.name,
    ).toBe('electric');
  });

  it('validates world encyclopedia responses and rejects insecure URLs', () => {
    expect(
      CachedItemDetailResponseSchema.safeParse({
        cache: 'miss',
        item: {
          id: 236,
          name: 'light-ball',
          cost: 1000,
          flingPower: 30,
          flingEffect: 'paralyze',
          category: 'held-items',
          attributes: ['holdable'],
          spriteUrl: 'http://pokeapi.co/media/sprites/items/light-ball.png',
          shortEffect: 'Doubles Pikachu SpA.',
          effect: 'Held by Pikachu: doubles Attack and Sp. Atk.',
          flavorTexts: [],
          heldByPokemon: [],
        },
      }).success,
    ).toBe(false);

    expect(
      CachedItemDetailResponseSchema.safeParse({
        cache: 'miss',
        item: {
          id: 236,
          name: 'light-ball',
          cost: 1000,
          flingPower: 30,
          flingEffect: 'paralyze',
          category: 'held-items',
          attributes: ['holdable'],
          spriteUrl:
            'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/light-ball.png',
          shortEffect: 'Doubles Pikachu SpA.',
          effect: 'Held by Pikachu: doubles Attack and Sp. Atk.',
          flavorTexts: [{ language: 'en', versionGroup: 'emerald', text: 'An orb for Pikachu.' }],
          heldByPokemon: [
            { pokemonId: 25, pokemonName: 'pikachu', artworkUrl: ARTWORK_URL, maxRarity: 5 },
          ],
        },
      }).success,
    ).toBe(true);

    expect(
      CachedBerryDetailResponseSchema.safeParse({
        cache: 'miss',
        berry: {
          id: 1,
          name: 'cheri',
          growthTime: 3,
          maxHarvest: 5,
          naturalGiftPower: 80,
          naturalGiftType: 'fire',
          sizeMm: 20,
          smoothness: 25,
          soilDryness: 15,
          firmness: 'soft',
          itemName: 'cheri-berry',
          itemId: 126,
          flavors: [{ flavor: 'spicy', potency: 10 }],
        },
      }).success,
    ).toBe(true);

    expect(
      CachedRegionDetailResponseSchema.safeParse({
        cache: 'hit',
        region: {
          id: 1,
          name: 'kanto',
          mainGeneration: 'generation-i',
          pokedexes: [{ id: 2, name: 'kanto' }],
          versionGroups: ['red-blue'],
          locations: [{ id: 67, name: 'viridian-forest' }],
        },
      }).success,
    ).toBe(true);

    expect(
      CachedPokedexDetailResponseSchema.safeParse({
        cache: 'hit',
        pokedex: {
          id: 2,
          name: 'kanto',
          isMainSeries: true,
          region: 'kanto',
          description: 'Original Kanto Pokédex',
          versionGroups: ['red-blue'],
          totalEntries: 1,
          entries: [
            { entryNumber: 25, speciesId: 25, speciesName: 'pikachu', artworkUrl: ARTWORK_URL },
          ],
        },
      }).success,
    ).toBe(true);

    expect(
      CachedLocationDetailResponseSchema.safeParse({
        cache: 'miss',
        location: {
          id: 67,
          name: 'viridian-forest',
          region: 'kanto',
          localizedName: 'Viridian Forest',
          areas: [{ id: 300, name: 'viridian-forest-area' }],
          generations: ['generation-i'],
        },
      }).success,
    ).toBe(true);

    expect(
      CachedEggGroupDetailResponseSchema.safeParse({
        cache: 'hit',
        eggGroup: {
          id: 6,
          name: 'fairy',
          speciesCount: 1,
          pokemonSpecies: [{ pokemonId: 25, pokemonName: 'pikachu', artworkUrl: ARTWORK_URL }],
        },
      }).success,
    ).toBe(true);

    expect(
      CachedGrowthRateDetailResponseSchema.safeParse({
        cache: 'hit',
        growthRate: {
          id: 2,
          name: 'medium',
          formula: '\\frac{5x^3}{4}',
          description: 'medium',
          levels: [{ level: 1, experience: 0 }],
          speciesCount: 1,
          pokemonSpecies: [{ pokemonId: 25, pokemonName: 'pikachu', artworkUrl: ARTWORK_URL }],
        },
      }).success,
    ).toBe(true);
  });
});
