import type {
  CachedPokemonEncountersResponse,
  CachedPokemonFormsResponse,
} from '@pokeverse/shared';
import type {
  CachedAbilityDetailResponse,
  CachedMoveDetailResponse,
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
      learnedByPokemon: [],
    },
  };
}
