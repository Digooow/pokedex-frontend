import {
  type CachedPokemonBundleResponse,
  computeDefensiveTypeEffectiveness,
} from '@pokeverse/shared';

export const POKEAPI_SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const POKEAPI_CRY_BASE = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon';

const DEFAULT_BASE_STATS: ReadonlyArray<readonly [string, number, number, number]> = [
  ['hp', 35, 0, 1],
  ['attack', 55, 0, 2],
  ['defense', 40, 0, 3],
  ['special-attack', 50, 0, 4],
  ['special-defense', 50, 0, 5],
  ['speed', 90, 2, 6],
];

const EMPTY_SPRITE_VARIANTS = {
  frontDefault: null,
  backDefault: null,
  frontShiny: null,
  backShiny: null,
  frontFemale: null,
  backFemale: null,
  frontShinyFemale: null,
  backShinyFemale: null,
} as const;

export interface PokemonBundleFixtureParams {
  readonly id: number;
  readonly name: string;
  readonly typeName: string;
  readonly typeId?: number;
  readonly height?: number;
  readonly weight?: number;
  readonly isLegendary?: boolean;
  readonly minimalMedia?: boolean;
}

export function createCachedPokemonBundleFixture(
  params: PokemonBundleFixtureParams,
): CachedPokemonBundleResponse {
  const artwork = `${POKEAPI_SPRITE_BASE}/other/official-artwork/${params.id}.png`;
  const shinyArt = `${POKEAPI_SPRITE_BASE}/other/official-artwork/shiny/${params.id}.png`;
  const home = `${POKEAPI_SPRITE_BASE}/other/home/${params.id}.png`;
  const showdown = params.minimalMedia
    ? null
    : `${POKEAPI_SPRITE_BASE}/other/showdown/${params.id}.gif`;
  const defaultSprite = `${POKEAPI_SPRITE_BASE}/${params.id}.png`;
  const eff = computeDefensiveTypeEffectiveness([
    {
      typeName: params.typeName,
      doubleDamageFrom: params.typeName === 'electric' ? ['ground'] : ['fire'],
      halfDamageFrom: params.typeName === 'electric' ? ['electric', 'flying', 'steel'] : ['water'],
      noDamageFrom: [],
    },
  ]);

  const baseMoves = [
    {
      name: 'thunder-shock',
      versionGroupDetails: [
        { levelLearnedAt: 1, learnMethod: 'level-up', versionGroup: 'scarlet-violet' },
      ],
    },
  ];
  const moves = params.minimalMedia
    ? baseMoves
    : [
        ...baseMoves,
        {
          name: 'thunderbolt',
          versionGroupDetails: [
            { levelLearnedAt: 0, learnMethod: 'machine', versionGroup: 'scarlet-violet' },
          ],
        },
      ];

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
        stats: DEFAULT_BASE_STATS.map(([name, baseStat, effort, statId]) => ({
          base_stat: baseStat,
          effort,
          stat: { name, url: `https://pokeapi.co/api/v2/stat/${statId}/` },
        })),
        sprites: {
          officialArtwork: { frontDefault: artwork, frontShiny: shinyArt },
          home: { frontDefault: home, frontShiny: null },
          showdown: { ...EMPTY_SPRITE_VARIANTS, frontDefault: showdown },
          default: {
            ...EMPTY_SPRITE_VARIANTS,
            frontDefault: defaultSprite,
            frontShiny: `${POKEAPI_SPRITE_BASE}/shiny/${params.id}.png`,
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
        cries: params.minimalMedia
          ? { latest: null, legacy: null }
          : {
              latest: `${POKEAPI_CRY_BASE}/latest/${params.id}.ogg`,
              legacy: `${POKEAPI_CRY_BASE}/legacy/${params.id}.ogg`,
            },
        moves,
        heldItems: [
          { itemName: 'light-ball', versionDetails: [{ version: 'scarlet', rarity: 5 }] },
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
          { isDefault: true, pokemonId: params.id, pokemonName: params.name, artworkUrl: artwork },
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
      typeEffectiveness: {
        multipliers: eff.multipliers,
        quadWeak: [...eff.quadWeak],
        weak: [...eff.weak],
        neutral: [...eff.neutral],
        resistant: [...eff.resistant],
        quadResistant: [...eff.quadResistant],
        immune: [...eff.immune],
      },
    },
  };
}
