import * as z from 'zod';
import { CacheOutcomeSchema, HttpsUrlSchema } from './pokedex.schemas';
import {
  EncyclopediaListEntrySchema,
  EncyclopediaPokemonRefSchema,
  LocalizedFlavorEntrySchema,
} from './pokedex-encyclopedia-combat.schemas';

export const ItemHeldByPokemonSchema = EncyclopediaPokemonRefSchema.extend({
  maxRarity: z.number().int().nonnegative(),
});

export const ItemDetailSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  cost: z.number().int().nonnegative(),
  flingPower: z.number().int().nonnegative().nullable(),
  flingEffect: z.string().min(1).nullable(),
  category: z.string().min(1).nullable(),
  attributes: z.array(z.string().min(1)),
  spriteUrl: HttpsUrlSchema.nullable(),
  shortEffect: z.string().nullable(),
  effect: z.string().nullable(),
  flavorTexts: z.array(LocalizedFlavorEntrySchema),
  heldByPokemon: z.array(ItemHeldByPokemonSchema),
});

export type ItemDetail = z.infer<typeof ItemDetailSchema>;

export const CachedItemDetailResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  item: ItemDetailSchema,
});

export type CachedItemDetailResponse = z.infer<typeof CachedItemDetailResponseSchema>;

export const BerryFlavorPotencySchema = z.object({
  flavor: z.string().min(1),
  potency: z.number().int().nonnegative(),
});

export const BerryDetailSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  growthTime: z.number().int().nonnegative(),
  maxHarvest: z.number().int().nonnegative(),
  naturalGiftPower: z.number().int().nonnegative(),
  naturalGiftType: z.string().min(1).nullable(),
  sizeMm: z.number().int().nonnegative(),
  smoothness: z.number().int().nonnegative(),
  soilDryness: z.number().int().nonnegative(),
  firmness: z.string().min(1).nullable(),
  itemName: z.string().min(1),
  itemId: z.number().int().positive().nullable(),
  flavors: z.array(BerryFlavorPotencySchema),
});

export type BerryDetail = z.infer<typeof BerryDetailSchema>;

export const CachedBerryDetailResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  berry: BerryDetailSchema,
});

export type CachedBerryDetailResponse = z.infer<typeof CachedBerryDetailResponseSchema>;

export const RegionDetailSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  mainGeneration: z.string().min(1).nullable(),
  pokedexes: z.array(EncyclopediaListEntrySchema),
  versionGroups: z.array(z.string().min(1)),
  locations: z.array(EncyclopediaListEntrySchema),
});

export type RegionDetail = z.infer<typeof RegionDetailSchema>;

export const CachedRegionDetailResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  region: RegionDetailSchema,
});

export type CachedRegionDetailResponse = z.infer<typeof CachedRegionDetailResponseSchema>;

export const RegionalPokedexEntrySchema = z.object({
  entryNumber: z.number().int().positive(),
  speciesId: z.number().int().positive(),
  speciesName: z.string().min(1),
  artworkUrl: HttpsUrlSchema,
});

export const PokedexDetailSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  isMainSeries: z.boolean(),
  region: z.string().min(1).nullable(),
  description: z.string().nullable(),
  versionGroups: z.array(z.string().min(1)),
  totalEntries: z.number().int().nonnegative(),
  entries: z.array(RegionalPokedexEntrySchema),
});

export type PokedexDetail = z.infer<typeof PokedexDetailSchema>;

export const CachedPokedexDetailResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  pokedex: PokedexDetailSchema,
});

export type CachedPokedexDetailResponse = z.infer<typeof CachedPokedexDetailResponseSchema>;

export const LocationDetailSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  region: z.string().min(1).nullable(),
  localizedName: z.string().min(1).nullable(),
  areas: z.array(EncyclopediaListEntrySchema),
  generations: z.array(z.string().min(1)),
});

export type LocationDetail = z.infer<typeof LocationDetailSchema>;

export const CachedLocationDetailResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  location: LocationDetailSchema,
});

export type CachedLocationDetailResponse = z.infer<typeof CachedLocationDetailResponseSchema>;

export const EggGroupDetailSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  speciesCount: z.number().int().nonnegative(),
  pokemonSpecies: z.array(EncyclopediaPokemonRefSchema),
});

export type EggGroupDetail = z.infer<typeof EggGroupDetailSchema>;

export const CachedEggGroupDetailResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  eggGroup: EggGroupDetailSchema,
});

export type CachedEggGroupDetailResponse = z.infer<typeof CachedEggGroupDetailResponseSchema>;

export const GrowthRateLevelSchema = z.object({
  level: z.number().int().positive(),
  experience: z.number().int().nonnegative(),
});

export const GrowthRateDetailSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  formula: z.string().min(1),
  description: z.string().nullable(),
  levels: z.array(GrowthRateLevelSchema),
  speciesCount: z.number().int().nonnegative(),
  pokemonSpecies: z.array(EncyclopediaPokemonRefSchema),
});

export type GrowthRateDetail = z.infer<typeof GrowthRateDetailSchema>;

export const CachedGrowthRateDetailResponseSchema = z.object({
  cache: CacheOutcomeSchema,
  growthRate: GrowthRateDetailSchema,
});

export type CachedGrowthRateDetailResponse = z.infer<typeof CachedGrowthRateDetailResponseSchema>;
