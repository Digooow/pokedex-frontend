import * as z from 'zod';
import { TOTAL_POKEDEX_SLOTS } from '../constants/platform.constants';

const MAX_POKEDEX_SLOT_INDEX = TOTAL_POKEDEX_SLOTS - 1;
const INVALID_SLOT_INDEX_MESSAGE = `Índice de slot deve estar entre 0 e ${MAX_POKEDEX_SLOT_INDEX}.`;
const POKEMON_IDENTIFIER_REGEX = /^[a-z0-9-]{1,64}$/;

export const PokedexSlotIndexParamSchema = z
  .union([
    z.number().int(),
    z
      .string()
      .regex(/^\d+$/, INVALID_SLOT_INDEX_MESSAGE)
      .transform((raw) => Number.parseInt(raw, 10)),
  ])
  .pipe(
    z
      .number()
      .int()
      .min(0, INVALID_SLOT_INDEX_MESSAGE)
      .max(MAX_POKEDEX_SLOT_INDEX, INVALID_SLOT_INDEX_MESSAGE),
  );

export const PokemonIdentifierParamSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(POKEMON_IDENTIFIER_REGEX, 'Identificador de Pokémon inválido.');

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export const HttpsUrlSchema = z.url().refine(isHttpsUrl, {
  message: 'Apenas URLs com protocolo HTTPS são permitidas.',
});

export const BoundedHttpsUrlSchema = z.url().max(512).refine(isHttpsUrl, {
  message: 'Apenas URLs com protocolo HTTPS são permitidas.',
});

export const PokeApiNamedResourceSchema = z.object({
  name: z.string().min(1),
  url: HttpsUrlSchema,
});

export const PokeApiCatalogResponseSchema = z.object({
  count: z.number().int().nonnegative(),
  results: z.array(PokeApiNamedResourceSchema),
});

export type PokeApiCatalogResponse = z.infer<typeof PokeApiCatalogResponseSchema>;

export const PokemonTypeSlotSchema = z.object({
  slot: z.number().int().positive(),
  type: PokeApiNamedResourceSchema,
});

export const PokemonAbilitySlotSchema = z.object({
  is_hidden: z.boolean(),
  slot: z.number().int().positive(),
  ability: PokeApiNamedResourceSchema,
});

export const PokemonStatEntrySchema = z.object({
  base_stat: z.number().int().nonnegative(),
  effort: z.number().int().nonnegative(),
  stat: PokeApiNamedResourceSchema,
});

export const PokemonDetailSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  height: z.number().int().nonnegative(),
  weight: z.number().int().nonnegative(),
  base_experience: z.number().int().nonnegative().nullable().optional(),
  types: z.array(PokemonTypeSlotSchema),
  abilities: z.array(PokemonAbilitySlotSchema),
  stats: z.array(PokemonStatEntrySchema),
  sprites: z.object({
    front_default: HttpsUrlSchema.nullable().optional(),
    front_shiny: HttpsUrlSchema.nullable().optional(),
    other: z
      .object({
        'official-artwork': z
          .object({
            front_default: HttpsUrlSchema.nullable().optional(),
            front_shiny: HttpsUrlSchema.nullable().optional(),
          })
          .optional(),
      })
      .optional(),
  }),
  cries: z
    .object({
      latest: HttpsUrlSchema.nullable().optional(),
      legacy: HttpsUrlSchema.nullable().optional(),
    })
    .optional(),
});

export type PokemonDetailDto = z.infer<typeof PokemonDetailSchema>;

export const SavePokedexSlotSchema = z
  .object({
    slotIndex: z.number().int().min(0).max(MAX_POKEDEX_SLOT_INDEX),
    pokemonId: z.number().int().positive(),
    pokemonName: z.string().trim().min(1).max(64),
    nickname: z.string().trim().min(1).max(40).nullable().optional(),
    spriteUrl: BoundedHttpsUrlSchema.nullable().optional(),
  })
  .strict();

export type SavePokedexSlotInput = z.infer<typeof SavePokedexSlotSchema>;

export const PokedexSlotRecordSchema = z.object({
  slotIndex: z.number().int().min(0).max(MAX_POKEDEX_SLOT_INDEX),
  pokemonId: z.number().int().positive(),
  pokemonName: z.string().min(1).max(64),
  nickname: z.string().nullable(),
  spriteUrl: HttpsUrlSchema.nullable(),
  updatedAt: z.iso.datetime(),
});

export type PokedexSlotRecord = z.infer<typeof PokedexSlotRecordSchema>;

export const PokedexSlotsListResponseSchema = z.object({
  slots: z.array(PokedexSlotRecordSchema),
});

export const CachedPokemonResponseSchema = z.object({
  cache: z.enum(['hit', 'miss', 'stale-fallback']),
  pokemon: PokemonDetailSchema,
});

export type CachedPokemonResponse = z.infer<typeof CachedPokemonResponseSchema>;

export const CachedCatalogResponseSchema = z.object({
  cache: z.enum(['hit', 'miss', 'stale-fallback']),
  catalog: PokeApiCatalogResponseSchema,
});

export type CachedCatalogResponse = z.infer<typeof CachedCatalogResponseSchema>;

export const PerfPreferenceSchema = z.enum(['auto', 'ultra', 'balanced', 'lite']);

export const ScenarioIdSchema = z.enum(['hoenn', 'cidade', 'vila', 'floresta']);
export type ScenarioId = z.infer<typeof ScenarioIdSchema>;

export const HardwareProfileSchema = z.object({
  tier: z.enum(['ultra', 'balanced', 'lite']),
  preference: PerfPreferenceSchema,
  reducedMotion: z.boolean(),
  coarsePointer: z.boolean(),
  webgl2Supported: z.boolean(),
  saveData: z.boolean(),
  deviceMemoryGb: z.number().positive().nullable(),
  hardwareConcurrency: z.number().int().positive().nullable(),
});

export type HardwareProfile = z.infer<typeof HardwareProfileSchema>;
