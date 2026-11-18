import { z } from 'zod';

export const PokeApiNamedResourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
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
    front_default: z.string().url().nullable().optional(),
    front_shiny: z.string().url().nullable().optional(),
    other: z
      .object({
        'official-artwork': z
          .object({
            front_default: z.string().url().nullable().optional(),
            front_shiny: z.string().url().nullable().optional(),
          })
          .optional(),
      })
      .optional(),
  }),
  cries: z
    .object({
      latest: z.string().url().nullable().optional(),
      legacy: z.string().url().nullable().optional(),
    })
    .optional(),
});

export type PokemonDetailDto = z.infer<typeof PokemonDetailSchema>;

export const SavePokedexSlotSchema = z
  .object({
    slotIndex: z.number().int().min(0).max(9),
    pokemonId: z.number().int().positive(),
    pokemonName: z.string().trim().min(1).max(64),
    nickname: z.string().trim().min(1).max(32).optional(),
  })
  .strict();

export type SavePokedexSlotInput = z.infer<typeof SavePokedexSlotSchema>;

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
