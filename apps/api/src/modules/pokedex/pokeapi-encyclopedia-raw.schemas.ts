import { PokeApiNamedResourceSchema } from '@pokeverse/shared';
import { z } from 'zod';

const OptionalUrlStringSchema = z.string().nullable().optional();

const RawEffectEntrySchema = z.object({
  effect: z.string(),
  short_effect: z.string().default(''),
  language: PokeApiNamedResourceSchema,
});

const RawFlavorTextEntrySchema = z.object({
  flavor_text: z.string(),
  language: PokeApiNamedResourceSchema,
  version_group: PokeApiNamedResourceSchema.nullable().optional(),
});

const RawItemFlavorEntrySchema = z.object({
  text: z.string(),
  language: PokeApiNamedResourceSchema,
  version_group: PokeApiNamedResourceSchema.nullable().optional(),
});

const RawDescriptionEntrySchema = z.object({
  description: z.string(),
  language: PokeApiNamedResourceSchema,
});

const RawLocalizedNameSchema = z.object({
  name: z.string(),
  language: PokeApiNamedResourceSchema,
});

export const RawPokeApiMoveSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  type: PokeApiNamedResourceSchema,
  damage_class: PokeApiNamedResourceSchema.nullable().optional(),
  power: z.number().int().nonnegative().nullable().optional(),
  accuracy: z.number().int().min(0).max(100).nullable().optional(),
  pp: z.number().int().nonnegative().nullable().optional(),
  priority: z.number().int().default(0),
  effect_chance: z.number().int().min(0).max(100).nullable().optional(),
  target: PokeApiNamedResourceSchema.nullable().optional(),
  generation: PokeApiNamedResourceSchema.nullable().optional(),
  meta: z
    .object({
      ailment: PokeApiNamedResourceSchema.nullable().optional(),
      category: PokeApiNamedResourceSchema.nullable().optional(),
    })
    .nullable()
    .optional(),
  stat_changes: z
    .array(
      z.object({
        change: z.number().int(),
        stat: PokeApiNamedResourceSchema,
      }),
    )
    .default([]),
  effect_entries: z.array(RawEffectEntrySchema).default([]),
  flavor_text_entries: z.array(RawFlavorTextEntrySchema).default([]),
  learned_by_pokemon: z.array(PokeApiNamedResourceSchema).default([]),
});

export type RawPokeApiMove = z.infer<typeof RawPokeApiMoveSchema>;

export const RawPokeApiAbilitySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  is_main_series: z.boolean().default(true),
  generation: PokeApiNamedResourceSchema.nullable().optional(),
  effect_entries: z.array(RawEffectEntrySchema).default([]),
  flavor_text_entries: z.array(RawFlavorTextEntrySchema).default([]),
  pokemon: z
    .array(
      z.object({
        is_hidden: z.boolean().default(false),
        slot: z.number().int().positive(),
        pokemon: PokeApiNamedResourceSchema,
      }),
    )
    .default([]),
});

export type RawPokeApiAbility = z.infer<typeof RawPokeApiAbilitySchema>;

export const RawPokeApiItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  cost: z.number().int().nonnegative().default(0),
  fling_power: z.number().int().nonnegative().nullable().optional(),
  fling_effect: PokeApiNamedResourceSchema.nullable().optional(),
  category: PokeApiNamedResourceSchema.nullable().optional(),
  attributes: z.array(PokeApiNamedResourceSchema).default([]),
  sprites: z
    .object({
      default: OptionalUrlStringSchema,
    })
    .optional(),
  effect_entries: z.array(RawEffectEntrySchema).default([]),
  flavor_text_entries: z.array(RawItemFlavorEntrySchema).default([]),
  held_by_pokemon: z
    .array(
      z.object({
        pokemon: PokeApiNamedResourceSchema,
        version_details: z
          .array(
            z.object({
              rarity: z.number().int().nonnegative(),
              version: PokeApiNamedResourceSchema,
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

export type RawPokeApiItem = z.infer<typeof RawPokeApiItemSchema>;

export const RawPokeApiBerrySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  growth_time: z.number().int().nonnegative(),
  max_harvest: z.number().int().nonnegative(),
  natural_gift_power: z.number().int().nonnegative(),
  natural_gift_type: PokeApiNamedResourceSchema.nullable().optional(),
  size: z.number().int().nonnegative(),
  smoothness: z.number().int().nonnegative(),
  soil_dryness: z.number().int().nonnegative(),
  firmness: PokeApiNamedResourceSchema.nullable().optional(),
  item: PokeApiNamedResourceSchema,
  flavors: z
    .array(
      z.object({
        potency: z.number().int().nonnegative(),
        flavor: PokeApiNamedResourceSchema,
      }),
    )
    .default([]),
});

export type RawPokeApiBerry = z.infer<typeof RawPokeApiBerrySchema>;

export const RawPokeApiRegionSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  main_generation: PokeApiNamedResourceSchema.nullable().optional(),
  pokedexes: z.array(PokeApiNamedResourceSchema).default([]),
  version_groups: z.array(PokeApiNamedResourceSchema).default([]),
  locations: z.array(PokeApiNamedResourceSchema).default([]),
});

export type RawPokeApiRegion = z.infer<typeof RawPokeApiRegionSchema>;

export const RawPokeApiPokedexSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  is_main_series: z.boolean().default(true),
  region: PokeApiNamedResourceSchema.nullable().optional(),
  descriptions: z.array(RawDescriptionEntrySchema).default([]),
  version_groups: z.array(PokeApiNamedResourceSchema).default([]),
  pokemon_entries: z
    .array(
      z.object({
        entry_number: z.number().int().positive(),
        pokemon_species: PokeApiNamedResourceSchema,
      }),
    )
    .default([]),
});

export type RawPokeApiPokedex = z.infer<typeof RawPokeApiPokedexSchema>;

export const RawPokeApiLocationSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  region: PokeApiNamedResourceSchema.nullable().optional(),
  names: z.array(RawLocalizedNameSchema).default([]),
  areas: z.array(PokeApiNamedResourceSchema).default([]),
  game_indices: z
    .array(
      z.object({
        game_index: z.number().int().nonnegative(),
        generation: PokeApiNamedResourceSchema,
      }),
    )
    .default([]),
});

export type RawPokeApiLocation = z.infer<typeof RawPokeApiLocationSchema>;

export const RawPokeApiEggGroupSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  pokemon_species: z.array(PokeApiNamedResourceSchema).default([]),
});

export type RawPokeApiEggGroup = z.infer<typeof RawPokeApiEggGroupSchema>;

export const RawPokeApiGrowthRateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  formula: z.string().min(1),
  descriptions: z.array(RawDescriptionEntrySchema).default([]),
  levels: z
    .array(
      z.object({
        level: z.number().int().positive(),
        experience: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  pokemon_species: z.array(PokeApiNamedResourceSchema).default([]),
});

export type RawPokeApiGrowthRate = z.infer<typeof RawPokeApiGrowthRateSchema>;

export const RawPokeApiNatureSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  increased_stat: PokeApiNamedResourceSchema.nullable().optional(),
  decreased_stat: PokeApiNamedResourceSchema.nullable().optional(),
  likes_flavor: PokeApiNamedResourceSchema.nullable().optional(),
  hates_flavor: PokeApiNamedResourceSchema.nullable().optional(),
});

export type RawPokeApiNature = z.infer<typeof RawPokeApiNatureSchema>;

export const RawPokeApiFullTypeSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  generation: PokeApiNamedResourceSchema.nullable().optional(),
  move_damage_class: PokeApiNamedResourceSchema.nullable().optional(),
  damage_relations: z.object({
    double_damage_from: z.array(PokeApiNamedResourceSchema).default([]),
    half_damage_from: z.array(PokeApiNamedResourceSchema).default([]),
    no_damage_from: z.array(PokeApiNamedResourceSchema).default([]),
    double_damage_to: z.array(PokeApiNamedResourceSchema).default([]),
    half_damage_to: z.array(PokeApiNamedResourceSchema).default([]),
    no_damage_to: z.array(PokeApiNamedResourceSchema).default([]),
  }),
  pokemon: z
    .array(
      z.object({
        slot: z.number().int().positive(),
        pokemon: PokeApiNamedResourceSchema,
      }),
    )
    .default([]),
  moves: z.array(PokeApiNamedResourceSchema).default([]),
});

export type RawPokeApiFullType = z.infer<typeof RawPokeApiFullTypeSchema>;
