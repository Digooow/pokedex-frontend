import { z } from 'zod';

export const PokeApiNamedResourceSchema = z.object({
  name: z.string().min(1),
  url: z.url(),
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
    front_default: z.url().nullable().optional(),
    front_shiny: z.url().nullable().optional(),
    other: z
      .object({
        'official-artwork': z
          .object({
            front_default: z.url().nullable().optional(),
            front_shiny: z.url().nullable().optional(),
          })
          .optional(),
      })
      .optional(),
  }),
  cries: z
    .object({
      latest: z.url().nullable().optional(),
      legacy: z.url().nullable().optional(),
    })
    .optional(),
});

export type PokemonDetailDto = z.infer<typeof PokemonDetailSchema>;

export const SavePokedexSlotSchema = z
  .object({
    slotIndex: z.number().int().min(0).max(9),
    pokemonId: z.number().int().positive(),
    pokemonName: z.string().trim().min(1).max(64),
    nickname: z.string().trim().min(1).max(40).nullable().optional(),
    spriteUrl: z.url().max(512).nullable().optional(),
  })
  .strict();

export type SavePokedexSlotInput = z.infer<typeof SavePokedexSlotSchema>;

export const PokedexSlotRecordSchema = z.object({
  slotIndex: z.number().int().min(0).max(9),
  pokemonId: z.number().int().positive(),
  pokemonName: z.string().min(1).max(64),
  nickname: z.string().nullable(),
  spriteUrl: z.url().nullable(),
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

export const HardwareProfileSchema = z.object({
  tier: z.enum(['ultra', 'balanced', 'lite']),
  preference: z.enum(['auto', 'ultra', 'balanced', 'lite']),
  reducedMotion: z.boolean(),
  coarsePointer: z.boolean(),
  webgl2Supported: z.boolean(),
  saveData: z.boolean(),
  deviceMemoryGb: z.number().positive().nullable(),
  hardwareConcurrency: z.number().int().positive().nullable(),
});

export type HardwareProfile = z.infer<typeof HardwareProfileSchema>;
