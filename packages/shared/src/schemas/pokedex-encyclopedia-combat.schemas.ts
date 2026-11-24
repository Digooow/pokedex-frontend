import * as z from 'zod';
import { CacheOutcomeSchema, HttpsUrlSchema } from './pokedex.schemas';

function createBoundedQueryIntSchema(min: number, max: number, fallback: number, message: string) {
  return z
    .union([
      z.literal('').transform(() => fallback),
      z.number().int(),
      z
        .string()
        .trim()
        .regex(/^\d+$/, message)
        .transform((raw) => Number.parseInt(raw, 10)),
    ])
    .pipe(z.number().int().min(min, message).max(max, message))
    .optional()
    .default(fallback);
}

export const ENCYCLOPEDIA_RESOURCE_KEYS = [
  'move',
  'ability',
  'item',
  'berry',
  'region',
  'pokedex',
  'location',
  'egg-group',
  'growth-rate',
  'nature',
  'type',
] as const;

export const EncyclopediaResourceKeySchema = z.enum(ENCYCLOPEDIA_RESOURCE_KEYS);
export type EncyclopediaResourceKey = z.infer<typeof EncyclopediaResourceKeySchema>;

export const EncyclopediaPaginationQuerySchema = z.object({
  limit: createBoundedQueryIntSchema(
    1,
    100,
    24,
    'Parâmetro limit deve ser um inteiro entre 1 e 100.',
  ),
  offset: createBoundedQueryIntSchema(
    0,
    10_000,
    0,
    'Parâmetro offset deve ser um inteiro entre 0 e 10000.',
  ),
  q: z.string().trim().max(64).optional().default(''),
});

export type EncyclopediaPaginationQuery = z.infer<typeof EncyclopediaPaginationQuerySchema>;

export const EncyclopediaListEntrySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
});

export type EncyclopediaListEntry = z.infer<typeof EncyclopediaListEntrySchema>;

export const CachedEncyclopediaListResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  resource: EncyclopediaResourceKeySchema,
  total: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  items: z.array(EncyclopediaListEntrySchema),
});

export type CachedEncyclopediaListResponse = z.infer<typeof CachedEncyclopediaListResponseSchema>;

export const EncyclopediaPokemonRefSchema = z.object({
  pokemonId: z.number().int().positive(),
  pokemonName: z.string().min(1),
  artworkUrl: HttpsUrlSchema,
});

export type EncyclopediaPokemonRef = z.infer<typeof EncyclopediaPokemonRefSchema>;

export const LocalizedFlavorEntrySchema = z.object({
  language: z.string().min(1),
  versionGroup: z.string().min(1).nullable(),
  text: z.string().min(1),
});

export type LocalizedFlavorEntry = z.infer<typeof LocalizedFlavorEntrySchema>;

export const MoveStatChangeSchema = z.object({
  stat: z.string().min(1),
  change: z.number().int(),
});

export const MoveDetailSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  type: z.string().min(1),
  damageClass: z.string().min(1).nullable(),
  power: z.number().int().nonnegative().nullable(),
  accuracy: z.number().int().min(0).max(100).nullable(),
  pp: z.number().int().nonnegative().nullable(),
  priority: z.number().int(),
  effectChance: z.number().int().min(0).max(100).nullable(),
  target: z.string().min(1).nullable(),
  generation: z.string().min(1).nullable(),
  ailment: z.string().min(1).nullable(),
  category: z.string().min(1).nullable(),
  statChanges: z.array(MoveStatChangeSchema),
  shortEffect: z.string().nullable(),
  effect: z.string().nullable(),
  flavorTexts: z.array(LocalizedFlavorEntrySchema),
  learnedByPokemon: z.array(EncyclopediaPokemonRefSchema),
});

export type MoveDetail = z.infer<typeof MoveDetailSchema>;

export const CachedMoveDetailResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  move: MoveDetailSchema,
});

export type CachedMoveDetailResponse = z.infer<typeof CachedMoveDetailResponseSchema>;

export const AbilityPokemonEntrySchema = EncyclopediaPokemonRefSchema.extend({
  isHidden: z.boolean(),
  slot: z.number().int().positive(),
});

export const AbilityDetailSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  isMainSeries: z.boolean(),
  generation: z.string().min(1).nullable(),
  shortEffect: z.string().nullable(),
  effect: z.string().nullable(),
  flavorTexts: z.array(LocalizedFlavorEntrySchema),
  pokemon: z.array(AbilityPokemonEntrySchema),
});

export type AbilityDetail = z.infer<typeof AbilityDetailSchema>;

export const CachedAbilityDetailResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  ability: AbilityDetailSchema,
});

export type CachedAbilityDetailResponse = z.infer<typeof CachedAbilityDetailResponseSchema>;

export const NatureSummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  increasedStat: z.string().min(1).nullable(),
  decreasedStat: z.string().min(1).nullable(),
  likesFlavor: z.string().min(1).nullable(),
  hatesFlavor: z.string().min(1).nullable(),
  isNeutral: z.boolean(),
});

export type NatureSummary = z.infer<typeof NatureSummarySchema>;

export const CachedNaturesListResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  total: z.number().int().nonnegative(),
  natures: z.array(NatureSummarySchema),
});

export type CachedNaturesListResponse = z.infer<typeof CachedNaturesListResponseSchema>;

export const CachedNatureDetailResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  nature: NatureSummarySchema,
});

export type CachedNatureDetailResponse = z.infer<typeof CachedNatureDetailResponseSchema>;

export const TypeDamageRelationsSummarySchema = z.object({
  doubleDamageFrom: z.array(z.string().min(1)),
  halfDamageFrom: z.array(z.string().min(1)),
  noDamageFrom: z.array(z.string().min(1)),
  doubleDamageTo: z.array(z.string().min(1)),
  halfDamageTo: z.array(z.string().min(1)),
  noDamageTo: z.array(z.string().min(1)),
});

export const TypeSummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  generation: z.string().min(1).nullable(),
  moveDamageClass: z.string().min(1).nullable(),
  damageRelations: TypeDamageRelationsSummarySchema,
  pokemonCount: z.number().int().nonnegative(),
  moveCount: z.number().int().nonnegative(),
});

export type TypeSummary = z.infer<typeof TypeSummarySchema>;

export const TypePokemonEntrySchema = EncyclopediaPokemonRefSchema.extend({
  slot: z.number().int().positive(),
});

export const TypeDetailSchema = TypeSummarySchema.extend({
  pokemon: z.array(TypePokemonEntrySchema),
  moves: z.array(EncyclopediaListEntrySchema),
});

export type TypeDetail = z.infer<typeof TypeDetailSchema>;

export const CachedTypesListResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  total: z.number().int().nonnegative(),
  types: z.array(TypeSummarySchema),
});

export type CachedTypesListResponse = z.infer<typeof CachedTypesListResponseSchema>;

export const CachedTypeDetailResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  type: TypeDetailSchema,
});

export type CachedTypeDetailResponse = z.infer<typeof CachedTypeDetailResponseSchema>;
