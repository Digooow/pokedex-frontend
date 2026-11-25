const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

export const SAMPLE_ENRICHED_CATALOG = {
  cache: 'hit',
  source: 'graphql',
  degraded: false,
  count: 3,
  items: [
    {
      id: 1,
      name: 'bulbasaur',
      isDefault: true,
      types: ['grass', 'poison'],
      generation: 1,
      habitat: 'grassland',
      color: 'green',
      shape: 'quadruped',
      isLegendary: false,
      isMythical: false,
      isBaby: false,
      baseStatTotal: 318,
    },
    {
      id: 4,
      name: 'charmander',
      isDefault: true,
      types: ['fire'],
      generation: 1,
      habitat: 'mountain',
      color: 'red',
      shape: 'upright',
      isLegendary: false,
      isMythical: false,
      isBaby: false,
      baseStatTotal: 309,
    },
    {
      id: 25,
      name: 'pikachu',
      isDefault: true,
      types: ['electric'],
      generation: 1,
      habitat: 'forest',
      color: 'yellow',
      shape: 'quadruped',
      isLegendary: false,
      isMythical: false,
      isBaby: false,
      baseStatTotal: 320,
    },
  ],
};

export const SAMPLE_META_FILTERS = {
  cache: 'hit',
  filters: {
    types: [
      { id: 10, name: 'fire' },
      { id: 12, name: 'grass' },
      { id: 13, name: 'electric' },
    ],
    generations: [{ id: 1, name: 'generation-i', regionName: 'kanto' }],
    habitats: [{ id: 2, name: 'forest' }],
    colors: [{ id: 10, name: 'yellow' }],
    shapes: [{ id: 8, name: 'quadruped' }],
    eggGroups: [{ id: 5, name: 'field' }],
    growthRates: [{ id: 2, name: 'medium' }],
    regions: [{ id: 1, name: 'kanto' }],
  },
};

export const SAMPLE_MOVES_LIST = {
  cache: 'hit',
  resource: 'move',
  total: 1,
  limit: 24,
  offset: 0,
  hasMore: false,
  items: [{ id: 84, name: 'thunder-shock' }],
};

export const SAMPLE_TYPES_LIST = {
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
        halfDamageFrom: ['electric', 'flying', 'steel'],
        noDamageFrom: [],
        doubleDamageTo: ['water', 'flying'],
        halfDamageTo: ['electric', 'grass', 'dragon'],
        noDamageTo: ['ground'],
      },
      pokemonCount: 1,
      moveCount: 1,
    },
  ],
};

export const SAMPLE_ELECTRIC_TYPE = {
  cache: 'hit',
  type: {
    ...SAMPLE_TYPES_LIST.types[0],
    pokemon: [
      {
        pokemonId: 25,
        pokemonName: 'pikachu',
        artworkUrl: `${SPRITE_BASE}/other/official-artwork/25.png`,
        slot: 1,
      },
    ],
    moves: [{ id: 84, name: 'thunder-shock' }],
  },
};
