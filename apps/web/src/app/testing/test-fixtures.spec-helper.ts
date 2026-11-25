import type { HttpTestingController } from '@angular/common/http/testing';
import {
  type CachedPokemonBundleResponse,
  type CachedPokemonResponse,
  type TrainerProfile,
  computeDefensiveTypeEffectiveness,
} from '@pokeverse/shared';

export function flushInitialRequests(httpMock: HttpTestingController): void {
  httpMock
    .match('/health/ready')
    .forEach((req) => req.flush(null, { status: 503, statusText: 'Down' }));
  httpMock
    .match('/api/v1/system/bootstrap')
    .forEach((req) => req.flush(null, { status: 503, statusText: 'Down' }));
  httpMock
    .match('/api/v1/auth/providers')
    .forEach((req) => req.flush({ googleEnabled: false, webauthnEnabled: true }));
  httpMock
    .match('/api/v1/auth/session')
    .forEach((req) => req.flush({ authenticated: false, canRefresh: false }));
}

export function createTrainerFixture(overrides?: Partial<TrainerProfile>): TrainerProfile {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    username: 'Red_Kanto',
    email: 'red@pokeverse.dev',
    emailVerifiedAt: null,
    mfaEnabled: false,
    hasPassword: true,
    role: 'TRAINER',
    badgesCount: 0,
    eloRating: 1000,
    lastMapId: 'pokeverse-town',
    lastX: 400,
    lastY: 320,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createCachedPokemonFixture(params: {
  readonly id: number;
  readonly name: string;
  readonly typeName: string;
  readonly typeId?: number;
  readonly height?: number;
  readonly weight?: number;
}): CachedPokemonResponse {
  return {
    cache: 'hit',
    pokemon: {
      id: params.id,
      name: params.name,
      height: params.height ?? 4,
      weight: params.weight ?? 60,
      types: [
        {
          slot: 1,
          type: {
            name: params.typeName,
            url: `https://pokeapi.co/api/v2/type/${params.typeId ?? 13}/`,
          },
        },
      ],
      abilities: [],
      stats: [],
      sprites: {
        front_default: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${params.id}.png`,
      },
    },
  };
}

export function createCachedPokemonBundleFixture(params: {
  readonly id: number;
  readonly name: string;
  readonly typeName: string;
  readonly typeId?: number;
  readonly height?: number;
  readonly weight?: number;
  readonly isLegendary?: boolean;
}): CachedPokemonBundleResponse {
  const spriteBase = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
  const artwork = `${spriteBase}/other/official-artwork/${params.id}.png`;
  const shinyArt = `${spriteBase}/other/official-artwork/shiny/${params.id}.png`;
  const home = `${spriteBase}/other/home/${params.id}.png`;
  const showdown = `${spriteBase}/other/showdown/${params.id}.gif`;
  const defaultSprite = `${spriteBase}/${params.id}.png`;
  const cryBase = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon';

  return {
    cache: 'hit',
    bundle: {
      pokemon: {
        id: params.id,
        name: params.name,
        order: params.id,
        isDefault: true,
        height: params.height ?? 4,
        weight: params.weight ?? 60,
        baseExperience: 112,
        baseStatTotal: 320,
        types: [
          {
            slot: 1,
            type: {
              name: params.typeName,
              url: `https://pokeapi.co/api/v2/type/${params.typeId ?? 13}/`,
            },
          },
        ],
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
          officialArtwork: { frontDefault: artwork, frontShiny: shinyArt },
          home: { frontDefault: home, frontShiny: null },
          showdown: {
            frontDefault: showdown,
            backDefault: null,
            frontShiny: null,
            backShiny: null,
            frontFemale: null,
            backFemale: null,
            frontShinyFemale: null,
            backShinyFemale: null,
          },
          default: {
            frontDefault: defaultSprite,
            backDefault: null,
            frontShiny: `${spriteBase}/shiny/${params.id}.png`,
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
            frontDefault: defaultSprite,
            frontShiny: null,
            animatedFrontDefault: null,
            animatedFrontShiny: null,
          },
        ],
        cries: {
          latest: `${cryBase}/latest/${params.id}.ogg`,
          legacy: `${cryBase}/legacy/${params.id}.ogg`,
        },
        moves: [
          {
            name: 'thunder-shock',
            versionGroupDetails: [
              { levelLearnedAt: 1, learnMethod: 'level-up', versionGroup: 'scarlet-violet' },
            ],
          },
          {
            name: 'thunderbolt',
            versionGroupDetails: [
              { levelLearnedAt: 0, learnMethod: 'machine', versionGroup: 'scarlet-violet' },
            ],
          },
        ],
        heldItems: [
          {
            itemName: 'light-ball',
            versionDetails: [{ version: 'scarlet', rarity: 5 }],
          },
        ],
        pastTypes: [],
        pastAbilities: [],
        pastStats: [],
      },
      species: {
        id: params.id,
        name: params.name,
        genus: 'Mouse Pokémon',
        genera: [{ language: 'en', genus: 'Mouse Pokémon' }],
        flavorTexts: [
          { version: 'red', language: 'en', text: 'Stores electricity in its cheeks.' },
        ],
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
        isLegendary: params.isLegendary ?? false,
        isMythical: false,
        formsSwitchable: false,
        eggGroups: ['field', 'fairy'],
        pokedexNumbers: [{ pokedex: 'kanto', entryNumber: params.id }],
        evolvesFromSpecies: null,
        varieties: [
          {
            isDefault: true,
            pokemonId: params.id,
            pokemonName: params.name,
            artworkUrl: artwork,
          },
        ],
      },
      evolutionChain: {
        id: 10,
        babyTriggerItem: null,
        root: {
          speciesId: params.id,
          speciesName: params.name,
          isBaby: false,
          evolutionDetails: [],
          evolvesTo: [
            {
              speciesId: params.id + 1,
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
      typeEffectiveness: (() => {
        const eff = computeDefensiveTypeEffectiveness([
          {
            typeName: params.typeName,
            doubleDamageFrom: params.typeName === 'electric' ? ['ground'] : ['fire'],
            halfDamageFrom:
              params.typeName === 'electric' ? ['electric', 'flying', 'steel'] : ['water'],
            noDamageFrom: [],
          },
        ]);
        return {
          multipliers: eff.multipliers,
          quadWeak: [...eff.quadWeak],
          weak: [...eff.weak],
          neutral: [...eff.neutral],
          resistant: [...eff.resistant],
          quadResistant: [...eff.quadResistant],
          immune: [...eff.immune],
        };
      })(),
    },
  };
}
