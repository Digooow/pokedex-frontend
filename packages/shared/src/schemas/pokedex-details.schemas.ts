import * as z from 'zod';
import { PokemonVarietyRefSchema } from './pokedex-bundle.schemas';
import { CacheOutcomeSchema, HttpsUrlSchema, PokemonTypeSlotSchema } from './pokedex.schemas';

export const PokemonEncounterConditionDetailSchema = z.object({
  minLevel: z.number().int().nonnegative(),
  maxLevel: z.number().int().nonnegative(),
  chance: z.number().int().min(0).max(100),
  method: z.string().min(1),
  conditionValues: z.array(z.string().min(1)),
});

export const PokemonEncounterVersionDetailSchema = z.object({
  version: z.string().min(1),
  maxChance: z.number().int().min(0).max(100),
  encounterDetails: z.array(PokemonEncounterConditionDetailSchema),
});

export const PokemonEncounterItemSchema = z.object({
  locationAreaName: z.string().min(1),
  locationAreaId: z.number().int().positive().nullable(),
  versionDetails: z.array(PokemonEncounterVersionDetailSchema),
});

export type PokemonEncounterItem = z.infer<typeof PokemonEncounterItemSchema>;

export const CachedPokemonEncountersResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  pokemonId: z.number().int().positive(),
  pokemonName: z.string().min(1),
  encounters: z.array(PokemonEncounterItemSchema),
});

export type CachedPokemonEncountersResponse = z.infer<typeof CachedPokemonEncountersResponseSchema>;

export const PokemonFormSpritesSchema = z.object({
  frontDefault: HttpsUrlSchema.nullable(),
  backDefault: HttpsUrlSchema.nullable(),
  frontFemale: HttpsUrlSchema.nullable(),
  frontShiny: HttpsUrlSchema.nullable(),
  backShiny: HttpsUrlSchema.nullable(),
  frontShinyFemale: HttpsUrlSchema.nullable(),
});

export const PokemonFormItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  formName: z.string(),
  formOrder: z.number().int().nonnegative(),
  isDefault: z.boolean(),
  isBattleOnly: z.boolean(),
  isMega: z.boolean(),
  versionGroup: z.string().min(1).nullable(),
  types: z.array(PokemonTypeSlotSchema),
  sprites: PokemonFormSpritesSchema,
});

export type PokemonFormItem = z.infer<typeof PokemonFormItemSchema>;

export const CachedPokemonFormsResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  pokemonId: z.number().int().positive(),
  pokemonName: z.string().min(1),
  speciesName: z.string().min(1),
  formsSwitchable: z.boolean(),
  forms: z.array(PokemonFormItemSchema),
  varieties: z.array(PokemonVarietyRefSchema),
});

export type CachedPokemonFormsResponse = z.infer<typeof CachedPokemonFormsResponseSchema>;
