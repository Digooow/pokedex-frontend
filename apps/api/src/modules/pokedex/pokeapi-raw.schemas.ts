import {
  PokeApiNamedResourceSchema,
  PokemonAbilitySlotSchema,
  PokemonStatEntrySchema,
  PokemonTypeSlotSchema,
} from '@pokeverse/shared';
import { z } from 'zod';

const OptionalUrlStringSchema = z.string().nullable().optional();

const RawSpritesVariantSchema = z
  .object({
    front_default: OptionalUrlStringSchema,
    back_default: OptionalUrlStringSchema,
    front_shiny: OptionalUrlStringSchema,
    back_shiny: OptionalUrlStringSchema,
    front_female: OptionalUrlStringSchema,
    back_female: OptionalUrlStringSchema,
    front_shiny_female: OptionalUrlStringSchema,
    back_shiny_female: OptionalUrlStringSchema,
  })
  .optional();

export const RawPokeApiPokemonSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  order: z.number().int(),
  is_default: z.boolean().default(true),
  height: z.number().int().nonnegative(),
  weight: z.number().int().nonnegative(),
  base_experience: z.number().int().nonnegative().nullable().optional(),
  species: PokeApiNamedResourceSchema,
  types: z.array(PokemonTypeSlotSchema),
  abilities: z.array(PokemonAbilitySlotSchema),
  stats: z.array(PokemonStatEntrySchema),
  sprites: z.object({
    front_default: OptionalUrlStringSchema,
    back_default: OptionalUrlStringSchema,
    front_shiny: OptionalUrlStringSchema,
    back_shiny: OptionalUrlStringSchema,
    front_female: OptionalUrlStringSchema,
    back_female: OptionalUrlStringSchema,
    front_shiny_female: OptionalUrlStringSchema,
    back_shiny_female: OptionalUrlStringSchema,
    other: z
      .object({
        'official-artwork': RawSpritesVariantSchema,
        home: RawSpritesVariantSchema,
        showdown: RawSpritesVariantSchema,
        dream_world: RawSpritesVariantSchema,
      })
      .optional(),
    versions: z
      .record(z.string(), z.record(z.string(), z.unknown()))
      .optional(),
  }),
  cries: z
    .object({
      latest: OptionalUrlStringSchema,
      legacy: OptionalUrlStringSchema,
    })
    .optional(),
  moves: z
    .array(
      z.object({
        move: PokeApiNamedResourceSchema,
        version_group_details: z.array(
          z.object({
            level_learned_at: z.number().int().nonnegative(),
            move_learn_method: PokeApiNamedResourceSchema,
            version_group: PokeApiNamedResourceSchema,
          }),
        ),
      }),
    )
    .default([]),
  held_items: z
    .array(
      z.object({
        item: PokeApiNamedResourceSchema,
        version_details: z.array(
          z.object({
            rarity: z.number().int().nonnegative(),
            version: PokeApiNamedResourceSchema,
          }),
        ),
      }),
    )
    .default([]),
  forms: z.array(PokeApiNamedResourceSchema).default([]),
  past_types: z
    .array(
      z.object({
        generation: PokeApiNamedResourceSchema,
        types: z.array(PokemonTypeSlotSchema),
      }),
    )
    .default([]),
  past_abilities: z
    .array(
      z.object({
        generation: PokeApiNamedResourceSchema,
        abilities: z.array(
          z.object({
            ability: PokeApiNamedResourceSchema.nullable(),
            is_hidden: z.boolean(),
            slot: z.number().int().positive(),
          }),
        ),
      }),
    )
    .default([]),
  past_stats: z
    .array(
      z.object({
        generation: PokeApiNamedResourceSchema,
        stats: z.array(PokemonStatEntrySchema),
      }),
    )
    .optional()
    .default([]),
});

export type RawPokeApiPokemon = z.infer<typeof RawPokeApiPokemonSchema>;

export const RawPokeApiSpeciesSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  capture_rate: z.number().int().min(0).max(255),
  base_happiness: z.number().int().min(0).max(255).nullable().optional(),
  gender_rate: z.number().int().min(-1).max(8),
  has_gender_differences: z.boolean().default(false),
  hatch_counter: z.number().int().nonnegative().nullable().optional(),
  growth_rate: PokeApiNamedResourceSchema.nullable().optional(),
  color: PokeApiNamedResourceSchema.nullable().optional(),
  shape: PokeApiNamedResourceSchema.nullable().optional(),
  habitat: PokeApiNamedResourceSchema.nullable().optional(),
  generation: PokeApiNamedResourceSchema.nullable().optional(),
  is_baby: z.boolean().default(false),
  is_legendary: z.boolean().default(false),
  is_mythical: z.boolean().default(false),
  forms_switchable: z.boolean().default(false),
  egg_groups: z.array(PokeApiNamedResourceSchema).default([]),
  pokedex_numbers: z
    .array(
      z.object({
        entry_number: z.number().int().positive(),
        pokedex: PokeApiNamedResourceSchema,
      }),
    )
    .default([]),
  evolves_from_species: PokeApiNamedResourceSchema.nullable().optional(),
  evolution_chain: z.object({ url: z.string() }).nullable().optional(),
  genera: z
    .array(
      z.object({
        genus: z.string(),
        language: PokeApiNamedResourceSchema,
      }),
    )
    .default([]),
  flavor_text_entries: z
    .array(
      z.object({
        flavor_text: z.string(),
        language: PokeApiNamedResourceSchema,
        version: PokeApiNamedResourceSchema,
      }),
    )
    .default([]),
  varieties: z
    .array(
      z.object({
        is_default: z.boolean(),
        pokemon: PokeApiNamedResourceSchema,
      }),
    )
    .default([]),
});

export type RawPokeApiSpecies = z.infer<typeof RawPokeApiSpeciesSchema>;

const RawEvolutionDetailSchema = z.object({
  trigger: PokeApiNamedResourceSchema,
  min_level: z.number().int().positive().nullable().optional(),
  item: PokeApiNamedResourceSchema.nullable().optional(),
  held_item: PokeApiNamedResourceSchema.nullable().optional(),
  known_move: PokeApiNamedResourceSchema.nullable().optional(),
  known_move_type: PokeApiNamedResourceSchema.nullable().optional(),
  location: PokeApiNamedResourceSchema.nullable().optional(),
  min_happiness: z.number().int().nonnegative().nullable().optional(),
  min_beauty: z.number().int().nonnegative().nullable().optional(),
  min_affection: z.number().int().nonnegative().nullable().optional(),
  needs_overworld_rain: z.boolean().default(false),
  time_of_day: z.string().default(''),
  gender: z.number().int().nullable().optional(),
  relative_physical_stats: z.number().int().nullable().optional(),
  trade_species: PokeApiNamedResourceSchema.nullable().optional(),
  party_species: PokeApiNamedResourceSchema.nullable().optional(),
  party_type: PokeApiNamedResourceSchema.nullable().optional(),
  turn_upside_down: z.boolean().default(false),
});

export interface RawEvolutionChainLink {
  readonly is_baby: boolean;
  readonly species: z.infer<typeof PokeApiNamedResourceSchema>;
  readonly evolution_details: readonly z.infer<
    typeof RawEvolutionDetailSchema
  >[];
  readonly evolves_to: readonly RawEvolutionChainLink[];
}

const RawEvolutionChainLinkSchema: z.ZodType<RawEvolutionChainLink> = z.lazy(
  () =>
    z.object({
      is_baby: z.boolean().default(false),
      species: PokeApiNamedResourceSchema,
      evolution_details: z.array(RawEvolutionDetailSchema).default([]),
      evolves_to: z.array(RawEvolutionChainLinkSchema).default([]),
    }),
);

export const RawPokeApiEvolutionChainSchema = z.object({
  id: z.number().int().positive(),
  baby_trigger_item: PokeApiNamedResourceSchema.nullable().optional(),
  chain: RawEvolutionChainLinkSchema,
});

export type RawPokeApiEvolutionChain = z.infer<
  typeof RawPokeApiEvolutionChainSchema
>;

export const RawPokeApiTypeSchema = z.object({
  name: z.string().min(1),
  damage_relations: z.object({
    double_damage_from: z.array(PokeApiNamedResourceSchema).default([]),
    half_damage_from: z.array(PokeApiNamedResourceSchema).default([]),
    no_damage_from: z.array(PokeApiNamedResourceSchema).default([]),
  }),
});

export type RawPokeApiType = z.infer<typeof RawPokeApiTypeSchema>;

export const RawPokeApiEncounterListSchema = z.array(
  z.object({
    location_area: PokeApiNamedResourceSchema,
    version_details: z.array(
      z.object({
        max_chance: z.number().int().min(0).max(100),
        version: PokeApiNamedResourceSchema,
        encounter_details: z.array(
          z.object({
            min_level: z.number().int().nonnegative(),
            max_level: z.number().int().nonnegative(),
            chance: z.number().int().min(0).max(100),
            method: PokeApiNamedResourceSchema,
            condition_values: z.array(PokeApiNamedResourceSchema).default([]),
          }),
        ),
      }),
    ),
  }),
);

export type RawPokeApiEncounterList = z.infer<
  typeof RawPokeApiEncounterListSchema
>;

export const RawPokeApiFormSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  form_name: z.string().default(''),
  form_order: z.number().int().nonnegative().default(0),
  is_default: z.boolean().default(false),
  is_battle_only: z.boolean().default(false),
  is_mega: z.boolean().default(false),
  version_group: PokeApiNamedResourceSchema.nullable().optional(),
  types: z.array(PokemonTypeSlotSchema).default([]),
  sprites: z.object({
    front_default: OptionalUrlStringSchema,
    back_default: OptionalUrlStringSchema,
    front_female: OptionalUrlStringSchema,
    front_shiny: OptionalUrlStringSchema,
    back_shiny: OptionalUrlStringSchema,
    front_shiny_female: OptionalUrlStringSchema,
  }),
});

export type RawPokeApiForm = z.infer<typeof RawPokeApiFormSchema>;
