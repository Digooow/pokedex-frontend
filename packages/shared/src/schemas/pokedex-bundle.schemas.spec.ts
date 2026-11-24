import { describe, expect, it } from 'vitest';
import { computeDefensiveTypeEffectiveness } from '../domain/type-effectiveness';
import { CachedPokemonBundleResponseSchema } from './pokedex-bundle.schemas';
import {
  CachedPokemonEncountersResponseSchema,
  CachedPokemonFormsResponseSchema,
} from './pokedex-details.schemas';

const ARTWORK_URL =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png';

function createValidBundlePayload() {
  return {
    cache: 'miss' as const,
    bundle: {
      pokemon: {
        id: 6,
        name: 'charizard',
        order: 7,
        isDefault: true,
        height: 17,
        weight: 905,
        baseExperience: 267,
        baseStatTotal: 534,
        types: [
          { slot: 1, type: { name: 'fire', url: 'https://pokeapi.co/api/v2/type/10/' } },
          { slot: 2, type: { name: 'flying', url: 'https://pokeapi.co/api/v2/type/3/' } },
        ],
        abilities: [
          {
            is_hidden: false,
            slot: 1,
            ability: { name: 'blaze', url: 'https://pokeapi.co/api/v2/ability/66/' },
          },
        ],
        stats: [
          {
            base_stat: 78,
            effort: 0,
            stat: { name: 'hp', url: 'https://pokeapi.co/api/v2/stat/1/' },
          },
        ],
        sprites: {
          officialArtwork: { frontDefault: ARTWORK_URL, frontShiny: null },
          home: { frontDefault: null, frontShiny: null },
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
            frontDefault: ARTWORK_URL,
            backDefault: null,
            frontShiny: null,
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
            frontDefault: ARTWORK_URL,
            frontShiny: null,
            animatedFrontDefault: null,
            animatedFrontShiny: null,
          },
        ],
        cries: {
          latest: 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/6.ogg',
          legacy: null,
        },
        moves: [
          {
            name: 'flamethrower',
            versionGroupDetails: [
              { levelLearnedAt: 36, learnMethod: 'level-up', versionGroup: 'red-blue' },
            ],
          },
        ],
        heldItems: [],
        pastTypes: [],
        pastAbilities: [],
        pastStats: [],
      },
      species: {
        id: 6,
        name: 'charizard',
        genus: 'Flame Pokémon',
        genera: [{ language: 'en', genus: 'Flame Pokémon' }],
        flavorTexts: [
          { version: 'red', language: 'en', text: 'Spits fire hot enough to melt boulders.' },
        ],
        captureRate: 45,
        baseHappiness: 50,
        genderRate: 1,
        hasGenderDifferences: false,
        hatchCounter: 20,
        growthRate: 'medium-slow',
        color: 'red',
        shape: 'upright',
        habitat: 'mountain',
        generation: 'generation-i',
        generationNumber: 1,
        isBaby: false,
        isLegendary: false,
        isMythical: false,
        formsSwitchable: false,
        eggGroups: ['monster', 'dragon'],
        pokedexNumbers: [{ pokedex: 'national', entryNumber: 6 }],
        evolvesFromSpecies: 'charmeleon',
        varieties: [
          { isDefault: true, pokemonId: 6, pokemonName: 'charizard', artworkUrl: ARTWORK_URL },
        ],
      },
      evolutionChain: {
        id: 2,
        babyTriggerItem: null,
        root: {
          speciesId: 4,
          speciesName: 'charmander',
          isBaby: false,
          evolutionDetails: [],
          evolvesTo: [
            {
              speciesId: 5,
              speciesName: 'charmeleon',
              isBaby: false,
              evolutionDetails: [
                {
                  trigger: 'level-up',
                  minLevel: 16,
                  item: null,
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
      typeEffectiveness: computeDefensiveTypeEffectiveness([]),
    },
  };
}

describe('pokedex bundle, encounters, and forms schemas', () => {
  it('validates recursive evolution chain bundle and rejects non-https URLs', () => {
    const valid = createValidBundlePayload();
    expect(CachedPokemonBundleResponseSchema.safeParse(valid).success).toBe(true);

    const invalidHttp = createValidBundlePayload();
    invalidHttp.bundle.pokemon.cries.latest = 'http://insecure.example/6.ogg';
    expect(CachedPokemonBundleResponseSchema.safeParse(invalidHttp).success).toBe(false);

    const invalidJs = createValidBundlePayload();
    invalidJs.bundle.pokemon.sprites.officialArtwork.frontDefault = 'javascript:alert(1)';
    expect(CachedPokemonBundleResponseSchema.safeParse(invalidJs).success).toBe(false);
  });

  it('validates encounters and forms response contracts', () => {
    expect(
      CachedPokemonEncountersResponseSchema.safeParse({
        cache: 'hit',
        pokemonId: 6,
        pokemonName: 'charizard',
        encounters: [
          {
            locationAreaName: 'cerulean-cave-1f',
            locationAreaId: 147,
            versionDetails: [
              {
                version: 'red',
                maxChance: 5,
                encounterDetails: [
                  { minLevel: 40, maxLevel: 45, chance: 5, method: 'walk', conditionValues: [] },
                ],
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);

    expect(
      CachedPokemonFormsResponseSchema.safeParse({
        cache: 'stale-fallback',
        pokemonId: 6,
        pokemonName: 'charizard',
        speciesName: 'charizard',
        formsSwitchable: true,
        forms: [
          {
            id: 10034,
            name: 'charizard-mega-x',
            formName: 'mega-x',
            formOrder: 2,
            isDefault: false,
            isBattleOnly: true,
            isMega: true,
            versionGroup: 'x-y',
            types: [{ slot: 1, type: { name: 'fire', url: 'https://pokeapi.co/api/v2/type/10/' } }],
            sprites: {
              frontDefault: ARTWORK_URL,
              backDefault: null,
              frontFemale: null,
              frontShiny: null,
              backShiny: null,
              frontShinyFemale: null,
            },
          },
        ],
        varieties: [
          { isDefault: true, pokemonId: 6, pokemonName: 'charizard', artworkUrl: ARTWORK_URL },
        ],
      }).success,
    ).toBe(true);
  });
});
