import {
  POKEAPI_SPRITE_BASE,
  createCachedPokemonBundleFixture,
} from '../src/app/testing/pokemon-bundle-fixture.spec-helper';

export const SAMPLE_CATALOG = {
  cache: 'hit',
  catalog: {
    count: 3,
    results: [
      { name: 'bulbasaur', url: 'https://pokeapi.co/api/v2/pokemon/1/' },
      { name: 'charmander', url: 'https://pokeapi.co/api/v2/pokemon/4/' },
      { name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon/25/' },
    ],
  },
};

export const SAMPLE_PIKACHU = {
  cache: 'hit',
  pokemon: {
    id: 25,
    name: 'pikachu',
    height: 4,
    weight: 60,
    types: [{ slot: 1, type: { name: 'electric', url: 'https://pokeapi.co/api/v2/type/13/' } }],
    abilities: [
      {
        is_hidden: false,
        slot: 1,
        ability: { name: 'static', url: 'https://pokeapi.co/api/v2/ability/9/' },
      },
    ],
    stats: [
      {
        base_stat: 35,
        effort: 0,
        stat: { name: 'hp', url: 'https://pokeapi.co/api/v2/stat/1/' },
      },
    ],
    sprites: {
      front_default: `${POKEAPI_SPRITE_BASE}/25.png`,
      other: {
        'official-artwork': {
          front_default: `${POKEAPI_SPRITE_BASE}/other/official-artwork/25.png`,
        },
      },
    },
  },
};

export const SAMPLE_PIKACHU_BUNDLE = createCachedPokemonBundleFixture({
  id: 25,
  name: 'pikachu',
  typeName: 'electric',
  minimalMedia: true,
});

export const SAMPLE_PIKACHU_ENCOUNTERS = {
  cache: 'hit',
  pokemonId: 25,
  pokemonName: 'pikachu',
  encounters: [
    {
      locationAreaName: 'viridian-forest-area',
      locationAreaId: 326,
      versionDetails: [
        {
          version: 'red',
          maxChance: 5,
          encounterDetails: [
            { minLevel: 3, maxLevel: 5, chance: 5, method: 'walk', conditionValues: [] },
          ],
        },
      ],
    },
  ],
};

export const SAMPLE_THUNDER_SHOCK_MOVE = {
  cache: 'hit',
  move: {
    id: 84,
    name: 'thunder-shock',
    type: 'electric',
    damageClass: 'special',
    power: 40,
    accuracy: 100,
    pp: 30,
    priority: 0,
    effectChance: 10,
    target: 'selected-pokemon',
    generation: 'generation-i',
    ailment: 'paralysis',
    category: 'damage+ailment',
    statChanges: [],
    shortEffect: 'Inflicts regular damage with a 10% chance to paralyze.',
    effect: 'Inflicts regular damage.',
    flavorTexts: [],
    learnedByPokemon: [
      {
        pokemonId: 25,
        pokemonName: 'pikachu',
        artworkUrl: `${POKEAPI_SPRITE_BASE}/other/official-artwork/25.png`,
      },
    ],
  },
};

export const SAMPLE_STATIC_ABILITY = {
  cache: 'hit',
  ability: {
    id: 9,
    name: 'static',
    isMainSeries: true,
    generation: 'generation-iii',
    shortEffect: 'May paralyze on contact.',
    effect: 'May paralyze on contact.',
    flavorTexts: [],
    pokemon: [],
  },
};
