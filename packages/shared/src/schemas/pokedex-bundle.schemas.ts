import * as z from 'zod';
import { POKEMON_TYPES } from '../constants/platform.constants';
import {
  CacheOutcomeSchema,
  HttpsUrlSchema,
  PokemonAbilitySlotSchema,
  PokemonStatEntrySchema,
  PokemonTypeSlotSchema,
} from './pokedex.schemas';

export const PokemonSpriteVariantPairSchema = z.object({
  frontDefault: HttpsUrlSchema.nullable(),
  frontShiny: HttpsUrlSchema.nullable(),
  frontFemale: HttpsUrlSchema.nullable().optional(),
  frontShinyFemale: HttpsUrlSchema.nullable().optional(),
});

export const PokemonDefaultSpriteSetSchema = z.object({
  frontDefault: HttpsUrlSchema.nullable(),
  backDefault: HttpsUrlSchema.nullable(),
  frontShiny: HttpsUrlSchema.nullable(),
  backShiny: HttpsUrlSchema.nullable(),
  frontFemale: HttpsUrlSchema.nullable(),
  backFemale: HttpsUrlSchema.nullable(),
  frontShinyFemale: HttpsUrlSchema.nullable(),
  backShinyFemale: HttpsUrlSchema.nullable(),
});

export const PokemonSpriteSetSchema = z.object({
  officialArtwork: z.object({
    frontDefault: HttpsUrlSchema.nullable(),
    frontShiny: HttpsUrlSchema.nullable(),
  }),
  home: PokemonSpriteVariantPairSchema,
  showdown: PokemonDefaultSpriteSetSchema,
  default: PokemonDefaultSpriteSetSchema,
  dreamWorld: z.object({
    frontDefault: HttpsUrlSchema.nullable(),
    frontFemale: HttpsUrlSchema.nullable(),
  }),
});

export const PokemonHistoricalSpriteSchema = z.object({
  generation: z.string().min(1),
  game: z.string().min(1),
  frontDefault: HttpsUrlSchema.nullable(),
  frontShiny: HttpsUrlSchema.nullable(),
  animatedFrontDefault: HttpsUrlSchema.nullable(),
  animatedFrontShiny: HttpsUrlSchema.nullable(),
});

export const PokemonMoveVersionDetailSchema = z.object({
  levelLearnedAt: z.number().int().nonnegative(),
  learnMethod: z.string().min(1),
  versionGroup: z.string().min(1),
});

export const PokemonMoveSummarySchema = z.object({
  name: z.string().min(1),
  versionGroupDetails: z.array(PokemonMoveVersionDetailSchema),
});

export const PokemonHeldItemVersionSchema = z.object({
  version: z.string().min(1),
  rarity: z.number().int().nonnegative(),
});

export const PokemonHeldItemSchema = z.object({
  itemName: z.string().min(1),
  versionDetails: z.array(PokemonHeldItemVersionSchema),
});

export const PokemonPastTypeSchema = z.object({
  generation: z.string().min(1),
  types: z.array(PokemonTypeSlotSchema),
});

export const PokemonPastAbilityEntrySchema = z.object({
  name: z.string().min(1).nullable(),
  slot: z.number().int().positive(),
  isHidden: z.boolean(),
});

export const PokemonPastAbilitySchema = z.object({
  generation: z.string().min(1),
  abilities: z.array(PokemonPastAbilityEntrySchema),
});

export const PokemonPastStatSchema = z.object({
  generation: z.string().min(1),
  stats: z.array(PokemonStatEntrySchema),
});

export const PokemonFlavorTextEntrySchema = z.object({
  version: z.string().min(1),
  language: z.string().min(1),
  text: z.string().min(1),
});

export const PokemonGenusEntrySchema = z.object({
  language: z.string().min(1),
  genus: z.string().min(1),
});

export const PokemonPokedexNumberSchema = z.object({
  pokedex: z.string().min(1),
  entryNumber: z.number().int().positive(),
});

export const PokemonVarietyRefSchema = z.object({
  isDefault: z.boolean(),
  pokemonId: z.number().int().positive(),
  pokemonName: z.string().min(1),
  artworkUrl: HttpsUrlSchema,
});

export type PokemonVarietyRef = z.infer<typeof PokemonVarietyRefSchema>;

export const PokemonSpeciesSummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  genus: z.string().nullable(),
  genera: z.array(PokemonGenusEntrySchema),
  flavorTexts: z.array(PokemonFlavorTextEntrySchema),
  captureRate: z.number().int().min(0).max(255),
  baseHappiness: z.number().int().min(0).max(255).nullable(),
  genderRate: z.number().int().min(-1).max(8),
  hasGenderDifferences: z.boolean(),
  hatchCounter: z.number().int().nonnegative().nullable(),
  growthRate: z.string().min(1).nullable(),
  color: z.string().min(1).nullable(),
  shape: z.string().min(1).nullable(),
  habitat: z.string().min(1).nullable(),
  generation: z.string().min(1).nullable(),
  generationNumber: z.number().int().min(1).max(9).nullable(),
  isBaby: z.boolean(),
  isLegendary: z.boolean(),
  isMythical: z.boolean(),
  formsSwitchable: z.boolean(),
  eggGroups: z.array(z.string().min(1)),
  pokedexNumbers: z.array(PokemonPokedexNumberSchema),
  evolvesFromSpecies: z.string().min(1).nullable(),
  varieties: z.array(PokemonVarietyRefSchema),
});

export type PokemonSpeciesSummary = z.infer<typeof PokemonSpeciesSummarySchema>;

export const EvolutionDetailSchema = z.object({
  trigger: z.string().min(1),
  minLevel: z.number().int().positive().nullable(),
  item: z.string().min(1).nullable(),
  heldItem: z.string().min(1).nullable(),
  knownMove: z.string().min(1).nullable(),
  knownMoveType: z.string().min(1).nullable(),
  location: z.string().min(1).nullable(),
  minHappiness: z.number().int().nonnegative().nullable(),
  minBeauty: z.number().int().nonnegative().nullable(),
  minAffection: z.number().int().nonnegative().nullable(),
  needsOverworldRain: z.boolean(),
  timeOfDay: z.string(),
  gender: z.number().int().nullable(),
  relativePhysicalStats: z.number().int().nullable(),
  tradeSpecies: z.string().min(1).nullable(),
  partySpecies: z.string().min(1).nullable(),
  partyType: z.string().min(1).nullable(),
  turnUpsideDown: z.boolean(),
});

export type EvolutionDetail = z.infer<typeof EvolutionDetailSchema>;

export interface EvolutionChainNode {
  readonly speciesId: number;
  readonly speciesName: string;
  readonly isBaby: boolean;
  readonly evolutionDetails: readonly EvolutionDetail[];
  readonly evolvesTo: readonly EvolutionChainNode[];
}

export const EvolutionChainNodeSchema: z.ZodType<EvolutionChainNode> = z.lazy(() =>
  z.object({
    speciesId: z.number().int().positive(),
    speciesName: z.string().min(1),
    isBaby: z.boolean(),
    evolutionDetails: z.array(EvolutionDetailSchema),
    evolvesTo: z.array(EvolutionChainNodeSchema),
  }),
);

export const EvolutionChainSummarySchema = z.object({
  id: z.number().int().positive(),
  babyTriggerItem: z.string().min(1).nullable(),
  root: EvolutionChainNodeSchema,
});

export type EvolutionChainSummary = z.infer<typeof EvolutionChainSummarySchema>;

const PokemonTypeEnumSchema = z.enum(POKEMON_TYPES);

export const TypeEffectivenessMatrixSchema = z.object({
  multipliers: z.record(PokemonTypeEnumSchema, z.number().nonnegative()),
  quadWeak: z.array(PokemonTypeEnumSchema),
  weak: z.array(PokemonTypeEnumSchema),
  neutral: z.array(PokemonTypeEnumSchema),
  resistant: z.array(PokemonTypeEnumSchema),
  quadResistant: z.array(PokemonTypeEnumSchema),
  immune: z.array(PokemonTypeEnumSchema),
});

export const PokemonBundlePokemonSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  order: z.number().int(),
  isDefault: z.boolean(),
  height: z.number().int().nonnegative(),
  weight: z.number().int().nonnegative(),
  baseExperience: z.number().int().nonnegative().nullable(),
  baseStatTotal: z.number().int().nonnegative(),
  types: z.array(PokemonTypeSlotSchema),
  abilities: z.array(PokemonAbilitySlotSchema),
  stats: z.array(PokemonStatEntrySchema),
  sprites: PokemonSpriteSetSchema,
  historicalSprites: z.array(PokemonHistoricalSpriteSchema),
  cries: z.object({
    latest: HttpsUrlSchema.nullable(),
    legacy: HttpsUrlSchema.nullable(),
  }),
  moves: z.array(PokemonMoveSummarySchema),
  heldItems: z.array(PokemonHeldItemSchema),
  pastTypes: z.array(PokemonPastTypeSchema),
  pastAbilities: z.array(PokemonPastAbilitySchema),
  pastStats: z.array(PokemonPastStatSchema),
});

export const PokemonBundleSchema = z.object({
  pokemon: PokemonBundlePokemonSchema,
  species: PokemonSpeciesSummarySchema,
  evolutionChain: EvolutionChainSummarySchema.nullable(),
  typeEffectiveness: TypeEffectivenessMatrixSchema,
});

export type PokemonBundle = z.infer<typeof PokemonBundleSchema>;

export const CachedPokemonBundleResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  bundle: PokemonBundleSchema,
});

export type CachedPokemonBundleResponse = z.infer<typeof CachedPokemonBundleResponseSchema>;
