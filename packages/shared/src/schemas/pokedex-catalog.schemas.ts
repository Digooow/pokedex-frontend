import * as z from 'zod';
import { POKEMON_TYPES } from '../constants/platform.constants';
import { type EnrichedCatalogItem } from '../domain/pokeapi-endpoints';
import { buildSearchableCatalogItem } from '../domain/pokedex-search';
import { CacheOutcomeSchema } from './pokedex.schemas';

export const EnrichedCatalogSourceSchema = z.enum(['graphql', 'rest-fallback']);
export type EnrichedCatalogSource = z.infer<typeof EnrichedCatalogSourceSchema>;

export const EnrichedCatalogEntrySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  isDefault: z.boolean(),
  types: z.array(z.enum(POKEMON_TYPES)).max(2),
  generation: z.number().int().min(1).max(9).nullable(),
  habitat: z.string().min(1).nullable(),
  color: z.string().min(1).nullable(),
  shape: z.string().min(1).nullable(),
  isLegendary: z.boolean(),
  isMythical: z.boolean(),
  isBaby: z.boolean(),
  baseStatTotal: z.number().int().nonnegative(),
});

export type EnrichedCatalogEntry = z.infer<typeof EnrichedCatalogEntrySchema>;

export const EnrichedCatalogPayloadSchema = z.object({
  source: EnrichedCatalogSourceSchema,
  degraded: z.boolean(),
  count: z.number().int().nonnegative(),
  items: z.array(EnrichedCatalogEntrySchema),
});

export type EnrichedCatalogPayload = z.infer<typeof EnrichedCatalogPayloadSchema>;

export const CachedEnrichedCatalogResponseSchema = EnrichedCatalogPayloadSchema.extend({
  cache: CacheOutcomeSchema,
});

export type CachedEnrichedCatalogResponse = z.infer<typeof CachedEnrichedCatalogResponseSchema>;

export const FilterOptionItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
});

export type FilterOptionItem = z.infer<typeof FilterOptionItemSchema>;

export const GenerationFilterOptionSchema = FilterOptionItemSchema.extend({
  regionName: z.string().min(1).nullable(),
});

export type GenerationFilterOption = z.infer<typeof GenerationFilterOptionSchema>;

export const PokedexMetaFiltersSchema = z.object({
  types: z.array(FilterOptionItemSchema),
  generations: z.array(GenerationFilterOptionSchema),
  habitats: z.array(FilterOptionItemSchema),
  colors: z.array(FilterOptionItemSchema),
  shapes: z.array(FilterOptionItemSchema),
  eggGroups: z.array(FilterOptionItemSchema),
  growthRates: z.array(FilterOptionItemSchema),
  regions: z.array(FilterOptionItemSchema),
});

export type PokedexMetaFilters = z.infer<typeof PokedexMetaFiltersSchema>;

export const CachedPokedexMetaFiltersResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  filters: PokedexMetaFiltersSchema,
});

export type CachedPokedexMetaFiltersResponse = z.infer<
  typeof CachedPokedexMetaFiltersResponseSchema
>;

export function hydrateEnrichedCatalog(
  entries: readonly EnrichedCatalogEntry[],
): readonly EnrichedCatalogItem[] {
  return entries.map((entry) => ({
    ...buildSearchableCatalogItem(entry.id, entry.name),
    isDefault: entry.isDefault,
    types: entry.types,
    generation: entry.generation ?? undefined,
    habitat: entry.habitat,
    color: entry.color,
    shape: entry.shape,
    isLegendary: entry.isLegendary,
    isMythical: entry.isMythical,
    isBaby: entry.isBaby,
    baseStatTotal: entry.baseStatTotal,
  }));
}
