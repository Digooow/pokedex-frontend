import type {
  CachedPokemonEncountersResponse,
  CachedPokemonFormsResponse,
} from '@pokeverse/shared';
import type {
  CachedAbilityDetailResponse,
  CachedEncyclopediaListResponse,
  CachedEnrichedCatalogResponse,
  CachedMoveDetailResponse,
  CachedNaturesListResponse,
  CachedPokedexMetaFiltersResponse,
  CachedTypeDetailResponse,
  CachedTypesListResponse,
} from '@pokeverse/shared/pokedex-encyclopedia';

export function createCachedEncountersFixture(
  pokemonId: number,
  pokemonName: string,
  empty = false,
): CachedPokemonEncountersResponse {
  return {
    cache: 'hit',
    pokemonId,
    pokemonName,
    encounters: empty
      ? []
      : [
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
}

export function createCachedFormsFixture(
  pokemonId: number,
  pokemonName: string,
): CachedPokemonFormsResponse {
  const spriteBase = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
  return {
    cache: 'hit',
    pokemonId,
    pokemonName,
    speciesName: pokemonName,
    formsSwitchable: false,
    forms: [
      {
        id: pokemonId,
        name: pokemonName,
        formName: 'default',
        formOrder: 1,
        isDefault: true,
        isBattleOnly: false,
        isMega: false,
        versionGroup: 'red-blue',
        types: [{ slot: 1, type: { name: 'electric', url: 'https://pokeapi.co/api/v2/type/13/' } }],
        sprites: {
          frontDefault: `${spriteBase}/${pokemonId}.png`,
          backDefault: null,
          frontFemale: null,
          frontShiny: null,
          backShiny: null,
          frontShinyFemale: null,
        },
      },
    ],
    varieties: [
      {
        isDefault: true,
        pokemonId,
        pokemonName,
        artworkUrl: `${spriteBase}/other/official-artwork/${pokemonId}.png`,
      },
    ],
  };
}

export function createCachedAbilityDetailFixture(name: string): CachedAbilityDetailResponse {
  return {
    cache: 'hit',
    ability: {
      id: 9,
      name,
      isMainSeries: true,
      generation: 'generation-iii',
      shortEffect: 'Has a 30% chance of paralyzing attacking Pokémon on contact.',
      effect: 'Contact moves may paralyze the attacker.',
      flavorTexts: [
        { language: 'en', versionGroup: 'scarlet-violet', text: 'May paralyze on contact.' },
      ],
      pokemon: [],
    },
  };
}

export function createCachedMoveDetailFixture(name: string): CachedMoveDetailResponse {
  return {
    cache: 'hit',
    move: {
      id: 84,
      name,
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
      flavorTexts: [{ language: 'en', versionGroup: 'scarlet-violet', text: 'An electric jolt.' }],
      learnedByPokemon: [
        {
          pokemonId: 25,
          pokemonName: 'pikachu',
          artworkUrl:
            'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',
        },
      ],
    },
  };
}

export function createEnrichedCatalogFixture(): CachedEnrichedCatalogResponse {
  return {
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
        eggGroups: ['monster', 'plant'],
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
        eggGroups: ['ground', 'fairy'],
      },
      {
        id: 150,
        name: 'mewtwo',
        isDefault: true,
        types: ['psychic'],
        generation: 1,
        habitat: 'rare',
        color: 'purple',
        shape: 'upright',
        isLegendary: true,
        isMythical: false,
        isBaby: false,
        baseStatTotal: 680,
        eggGroups: ['no-eggs'],
      },
    ],
  };
}

export function createMetaFiltersFixture(): CachedPokedexMetaFiltersResponse {
  return {
    cache: 'hit',
    filters: {
      types: [
        { id: 12, name: 'grass' },
        { id: 13, name: 'electric' },
        { id: 14, name: 'psychic' },
      ],
      generations: [{ id: 1, name: 'generation-i', regionName: 'kanto' }],
      habitats: [
        { id: 2, name: 'forest' },
        { id: 3, name: 'grassland' },
      ],
      colors: [
        { id: 5, name: 'green' },
        { id: 10, name: 'yellow' },
      ],
      shapes: [{ id: 8, name: 'quadruped' }],
      eggGroups: [{ id: 5, name: 'field' }],
      growthRates: [{ id: 2, name: 'medium' }],
      regions: [{ id: 1, name: 'kanto' }],
    },
  };
}

export function createEncyclopediaMovesListFixture(): CachedEncyclopediaListResponse {
  return {
    cache: 'hit',
    resource: 'move',
    total: 2,
    limit: 24,
    offset: 0,
    hasMore: false,
    items: [
      { id: 84, name: 'thunder-shock' },
      { id: 85, name: 'thunderbolt' },
    ],
  };
}

export function createEncyclopediaNaturesListFixture(): CachedNaturesListResponse {
  return {
    cache: 'hit',
    total: 2,
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
      {
        id: 2,
        name: 'adamant',
        increasedStat: 'attack',
        decreasedStat: 'special-attack',
        likesFlavor: 'spicy',
        hatesFlavor: 'dry',
        isNeutral: false,
      },
    ],
  };
}

export function createEncyclopediaTypesListFixture(): CachedTypesListResponse {
  return {
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
}

export function createCachedTypeDetailFixture(): CachedTypeDetailResponse {
  return {
    cache: 'hit',
    type: {
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
      pokemon: [
        {
          pokemonId: 25,
          pokemonName: 'pikachu',
          artworkUrl:
            'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',
          slot: 1,
        },
      ],
      moves: [{ id: 84, name: 'thunder-shock' }],
    },
  };
}
