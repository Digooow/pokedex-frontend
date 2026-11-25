import { computeDefensiveTypeEffectiveness } from '@pokeverse/shared';

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

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
      front_default: `${SPRITE_BASE}/25.png`,
      other: {
        'official-artwork': {
          front_default: `${SPRITE_BASE}/other/official-artwork/25.png`,
        },
      },
    },
  },
};

export const SAMPLE_PIKACHU_BUNDLE = {
  cache: 'hit',
  bundle: {
    pokemon: {
      id: 25,
      name: 'pikachu',
      order: 25,
      isDefault: true,
      height: 4,
      weight: 60,
      baseExperience: 112,
      baseStatTotal: 320,
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
        {
          base_stat: 55,
          effort: 0,
          stat: { name: 'attack', url: 'https://pokeapi.co/api/v2/stat/2/' },
        },
        {
          base_stat: 40,
          effort: 0,
          stat: { name: 'defense', url: 'https://pokeapi.co/api/v2/stat/3/' },
        },
        {
          base_stat: 50,
          effort: 0,
          stat: { name: 'special-attack', url: 'https://pokeapi.co/api/v2/stat/4/' },
        },
        {
          base_stat: 50,
          effort: 0,
          stat: { name: 'special-defense', url: 'https://pokeapi.co/api/v2/stat/5/' },
        },
        {
          base_stat: 90,
          effort: 2,
          stat: { name: 'speed', url: 'https://pokeapi.co/api/v2/stat/6/' },
        },
      ],
      sprites: {
        officialArtwork: {
          frontDefault: `${SPRITE_BASE}/other/official-artwork/25.png`,
          frontShiny: `${SPRITE_BASE}/other/official-artwork/shiny/25.png`,
        },
        home: { frontDefault: `${SPRITE_BASE}/other/home/25.png`, frontShiny: null },
        showdown: {
          frontDefault: null,
          backDefault: null,
          frontShiny: null,
          backShiny: null,
          frontFemale: null,
          backFemale: null,
          frontShinyFemale: null,
          backShinyFemale: null,
        },
        default: {
          frontDefault: `${SPRITE_BASE}/25.png`,
          backDefault: null,
          frontShiny: `${SPRITE_BASE}/shiny/25.png`,
          backShiny: null,
          frontFemale: null,
          backFemale: null,
          frontShinyFemale: null,
          backShinyFemale: null,
        },
        dreamWorld: { frontDefault: null, frontFemale: null },
      },
      historicalSprites: [
        {
          generation: 'generation-i',
          game: 'red-blue',
          frontDefault: `${SPRITE_BASE}/25.png`,
          frontShiny: null,
          animatedFrontDefault: null,
          animatedFrontShiny: null,
        },
      ],
      cries: { latest: null, legacy: null },
      moves: [
        {
          name: 'thunder-shock',
          versionGroupDetails: [
            { levelLearnedAt: 1, learnMethod: 'level-up', versionGroup: 'scarlet-violet' },
          ],
        },
      ],
      heldItems: [{ itemName: 'light-ball', versionDetails: [{ version: 'scarlet', rarity: 5 }] }],
      pastTypes: [],
      pastAbilities: [],
      pastStats: [],
    },
    species: {
      id: 25,
      name: 'pikachu',
      genus: 'Mouse Pokémon',
      genera: [{ language: 'en', genus: 'Mouse Pokémon' }],
      flavorTexts: [{ version: 'red', language: 'en', text: 'Stores electricity in its cheeks.' }],
      captureRate: 190,
      baseHappiness: 70,
      genderRate: 4,
      hasGenderDifferences: true,
      hatchCounter: 10,
      growthRate: 'medium',
      color: 'yellow',
      shape: 'quadruped',
      habitat: 'forest',
      generation: 'generation-i',
      generationNumber: 1,
      isBaby: false,
      isLegendary: false,
      isMythical: false,
      formsSwitchable: false,
      eggGroups: ['field', 'fairy'],
      pokedexNumbers: [{ pokedex: 'kanto', entryNumber: 25 }],
      evolvesFromSpecies: null,
      varieties: [
        {
          isDefault: true,
          pokemonId: 25,
          pokemonName: 'pikachu',
          artworkUrl: `${SPRITE_BASE}/other/official-artwork/25.png`,
        },
      ],
    },
    evolutionChain: {
      id: 10,
      babyTriggerItem: null,
      root: {
        speciesId: 25,
        speciesName: 'pikachu',
        isBaby: false,
        evolutionDetails: [],
        evolvesTo: [
          {
            speciesId: 26,
            speciesName: 'raichu',
            isBaby: false,
            evolutionDetails: [
              {
                trigger: 'use-item',
                minLevel: null,
                item: 'thunder-stone',
                heldItem: null,
                knownMove: null,
                knownMoveType: null,
                location: null,
                minHappiness: null,
                minBeauty: null,
                minAffection: null,
                needsOverworldRain: false,
                timeOfDay: '',
                gender: null,
                relativePhysicalStats: null,
                tradeSpecies: null,
                partySpecies: null,
                partyType: null,
                turnUpsideDown: false,
              },
            ],
            evolvesTo: [],
          },
        ],
      },
    },
    typeEffectiveness: computeDefensiveTypeEffectiveness([
      {
        typeName: 'electric',
        doubleDamageFrom: ['ground'],
        halfDamageFrom: ['electric', 'flying', 'steel'],
        noDamageFrom: [],
      },
    ]),
  },
};

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
        artworkUrl: `${SPRITE_BASE}/other/official-artwork/25.png`,
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
