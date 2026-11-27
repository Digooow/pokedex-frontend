import { z } from 'zod';

export const GraphQlErrorItemSchema = z.object({
  message: z.string(),
});

export const GraphQlEnrichedPokemonRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  is_default: z.boolean().default(true),
  pokemontypes: z
    .array(
      z.object({
        slot: z.number().int().positive().optional(),
        type: z.object({
          name: z.string().min(1),
        }),
      }),
    )
    .default([]),
  pokemonstats: z
    .array(
      z.object({
        base_stat: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  pokemonspecy: z
    .object({
      generation_id: z.number().int().nullable().optional(),
      is_legendary: z.boolean().default(false),
      is_mythical: z.boolean().default(false),
      is_baby: z.boolean().default(false),
      pokemonhabitat: z
        .object({ name: z.string().min(1) })
        .nullable()
        .optional(),
      pokemoncolor: z
        .object({ name: z.string().min(1) })
        .nullable()
        .optional(),
      pokemonshape: z
        .object({ name: z.string().min(1) })
        .nullable()
        .optional(),
      pokemonegggroups: z
        .array(
          z.object({
            egggroup: z.object({ name: z.string().min(1) }),
          }),
        )
        .default([]),
    })
    .nullable()
    .optional(),
});

export type GraphQlEnrichedPokemonRow = z.infer<
  typeof GraphQlEnrichedPokemonRowSchema
>;

export const GraphQlEnrichedCatalogResponseSchema = z.object({
  data: z
    .object({
      pokemon: z.array(GraphQlEnrichedPokemonRowSchema),
    })
    .nullable()
    .optional(),
  errors: z.array(GraphQlErrorItemSchema).optional(),
});

export const GraphQlMetaOptionSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
});

export const GraphQlMetaGenerationSchema = GraphQlMetaOptionSchema.extend({
  region: z
    .object({
      name: z.string().min(1),
    })
    .nullable()
    .optional(),
});

export const GraphQlMetaFiltersResponseSchema = z.object({
  data: z
    .object({
      generation: z.array(GraphQlMetaGenerationSchema),
      pokemonhabitat: z.array(GraphQlMetaOptionSchema),
      pokemoncolor: z.array(GraphQlMetaOptionSchema),
      pokemonshape: z.array(GraphQlMetaOptionSchema),
      egggroup: z.array(GraphQlMetaOptionSchema),
      growthrate: z.array(GraphQlMetaOptionSchema),
      region: z.array(GraphQlMetaOptionSchema),
      type: z.array(GraphQlMetaOptionSchema),
    })
    .nullable()
    .optional(),
  errors: z.array(GraphQlErrorItemSchema).optional(),
});
