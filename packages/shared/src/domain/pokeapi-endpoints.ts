import * as z from 'zod';
import { MAX_CATALOG_RESULTS, POKEMON_TYPES, type PokemonTypeName } from '../constants/platform.constants';
import { type SearchablePokemonItem, filterPokemonCatalog } from './pokedex-search';

export type PokeApiEndpointCategory =
  | 'core-pokemon'
  | 'evolution-genetics'
  | 'combat-mechanics'
  | 'world-encounters'
  | 'items-berries'
  | 'contests-meta';

export type CacheTierPolicy = 'hot-redis-24h' | 'lazy-tab-24h' | 'static-lookup-7d' | 'stale-snapshot';

export interface PokeApiEndpointSpec {
  readonly key: string;
  readonly pathTemplate: string;
  readonly category: PokeApiEndpointCategory;
  readonly cachePolicy: CacheTierPolicy;
  readonly implementedInBff: boolean;
  readonly targetFeature: string;
}

export const POKEAPI_V2_ENDPOINTS: readonly PokeApiEndpointSpec[] = [
  { key: 'ability', pathTemplate: '/api/v2/ability/{idOrName}', category: 'combat-mechanics', cachePolicy: 'lazy-tab-24h', implementedInBff: false, targetFeature: 'Pokedex Visor & Battle Engine' },
  { key: 'berry', pathTemplate: '/api/v2/berry/{idOrName}', category: 'items-berries', cachePolicy: 'lazy-tab-24h', implementedInBff: false, targetFeature: 'Inventory & Held Consumables' },
  { key: 'berry-firmness', pathTemplate: '/api/v2/berry-firmness/{idOrName}', category: 'items-berries', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Berry Lab & Crafting' },
  { key: 'berry-flavor', pathTemplate: '/api/v2/berry-flavor/{idOrName}', category: 'items-berries', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Nature Affinity & Confusion' },
  { key: 'characteristic', pathTemplate: '/api/v2/characteristic/{id}', category: 'evolution-genetics', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Genetic Lab IV Inspector' },
  { key: 'contest-effect', pathTemplate: '/api/v2/contest-effect/{id}', category: 'contests-meta', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Pokedex Contest Archive' },
  { key: 'contest-type', pathTemplate: '/api/v2/contest-type/{idOrName}', category: 'contests-meta', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Move Appeal Metadata' },
  { key: 'egg-group', pathTemplate: '/api/v2/egg-group/{idOrName}', category: 'evolution-genetics', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Replication & Egg Compatibility' },
  { key: 'encounter-condition', pathTemplate: '/api/v2/encounter-condition/{idOrName}', category: 'world-encounters', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Spawn Probability Engine' },
  { key: 'encounter-condition-value', pathTemplate: '/api/v2/encounter-condition-value/{idOrName}', category: 'world-encounters', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Day/Night & Weather Encounters' },
  { key: 'encounter-method', pathTemplate: '/api/v2/encounter-method/{idOrName}', category: 'world-encounters', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Habitat Map & Fishing' },
  { key: 'evolution-chain', pathTemplate: '/api/v2/evolution-chain/{id}', category: 'evolution-genetics', cachePolicy: 'hot-redis-24h', implementedInBff: false, targetFeature: 'Evolution Tree & Chance Calc' },
  { key: 'evolution-trigger', pathTemplate: '/api/v2/evolution-trigger/{idOrName}', category: 'evolution-genetics', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Catalyst & Evolution Conditions' },
  { key: 'gender', pathTemplate: '/api/v2/gender/{idOrName}', category: 'evolution-genetics', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Dimorphism & Cloning Fidelity' },
  { key: 'generation', pathTemplate: '/api/v2/generation/{idOrName}', category: 'world-encounters', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Advanced Catalog Filter (I-IX)' },
  { key: 'growth-rate', pathTemplate: '/api/v2/growth-rate/{idOrName}', category: 'evolution-genetics', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'XP Curve & Level Stat Simulator' },
  { key: 'item', pathTemplate: '/api/v2/item/{idOrName}', category: 'items-berries', cachePolicy: 'lazy-tab-24h', implementedInBff: false, targetFeature: 'Stones, Held Items & Lab Gear' },
  { key: 'item-attribute', pathTemplate: '/api/v2/item-attribute/{idOrName}', category: 'items-berries', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Item Filtering' },
  { key: 'item-category', pathTemplate: '/api/v2/item-category/{idOrName}', category: 'items-berries', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Catalog & Shop Grouping' },
  { key: 'item-fling-effect', pathTemplate: '/api/v2/item-fling-effect/{idOrName}', category: 'items-berries', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Move Fling Resolution' },
  { key: 'item-pocket', pathTemplate: '/api/v2/item-pocket/{idOrName}', category: 'items-berries', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Trainer Bag UI' },
  { key: 'language', pathTemplate: '/api/v2/language/{idOrName}', category: 'contests-meta', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Multilingual Localization' },
  { key: 'location', pathTemplate: '/api/v2/location/{idOrName}', category: 'world-encounters', cachePolicy: 'lazy-tab-24h', implementedInBff: false, targetFeature: 'Regions Museum & Radar' },
  { key: 'location-area', pathTemplate: '/api/v2/location-area/{idOrName}', category: 'world-encounters', cachePolicy: 'lazy-tab-24h', implementedInBff: false, targetFeature: 'Zone Encounter Tables' },
  { key: 'machine', pathTemplate: '/api/v2/machine/{id}', category: 'combat-mechanics', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'TM/HM Move Acquisition' },
  { key: 'move', pathTemplate: '/api/v2/move/{idOrName}', category: 'combat-mechanics', cachePolicy: 'lazy-tab-24h', implementedInBff: false, targetFeature: 'Moveset Inspector & Damage Calc' },
  { key: 'move-ailment', pathTemplate: '/api/v2/move-ailment/{idOrName}', category: 'combat-mechanics', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Status Effects Engine' },
  { key: 'move-battle-style', pathTemplate: '/api/v2/move-battle-style/{idOrName}', category: 'combat-mechanics', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'AI Bot Tactical Behavior' },
  { key: 'move-category', pathTemplate: '/api/v2/move-category/{idOrName}', category: 'combat-mechanics', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Skill Categorization' },
  { key: 'move-damage-class', pathTemplate: '/api/v2/move-damage-class/{idOrName}', category: 'combat-mechanics', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Physical/Special/Status Split' },
  { key: 'move-learn-method', pathTemplate: '/api/v2/move-learn-method/{idOrName}', category: 'combat-mechanics', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Learnset Filter Tabs' },
  { key: 'move-target', pathTemplate: '/api/v2/move-target/{idOrName}', category: 'combat-mechanics', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Singles/Doubles Target Rules' },
  { key: 'nature', pathTemplate: '/api/v2/nature/{idOrName}', category: 'combat-mechanics', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Stat Simulator & Team Builder' },
  { key: 'pal-park-area', pathTemplate: '/api/v2/pal-park-area/{idOrName}', category: 'world-encounters', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Legacy Biome Metadata' },
  { key: 'pokeathlon-stat', pathTemplate: '/api/v2/pokeathlon-stat/{idOrName}', category: 'contests-meta', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Mini-Game Performance Metrics' },
  { key: 'pokedex', pathTemplate: '/api/v2/pokedex/{idOrName}', category: 'core-pokemon', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Regional Pokedex Switching' },
  { key: 'pokemon', pathTemplate: '/api/v2/pokemon/{idOrName}', category: 'core-pokemon', cachePolicy: 'stale-snapshot', implementedInBff: true, targetFeature: 'Core Pokedex Sheet & Catalog' },
  { key: 'pokemon-color', pathTemplate: '/api/v2/pokemon-color/{idOrName}', category: 'core-pokemon', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Visual Color Search Filter' },
  { key: 'pokemon-form', pathTemplate: '/api/v2/pokemon-form/{idOrName}', category: 'core-pokemon', cachePolicy: 'lazy-tab-24h', implementedInBff: false, targetFeature: 'Forms & Regional Variants UI' },
  { key: 'pokemon-habitat', pathTemplate: '/api/v2/pokemon-habitat/{idOrName}', category: 'world-encounters', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Biome Search Filter & Radar' },
  { key: 'pokemon-shape', pathTemplate: '/api/v2/pokemon-shape/{idOrName}', category: 'core-pokemon', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Silhouette Filter & Minigame' },
  { key: 'pokemon-species', pathTemplate: '/api/v2/pokemon-species/{idOrName}', category: 'core-pokemon', cachePolicy: 'stale-snapshot', implementedInBff: false, targetFeature: 'Lore, Capture Rate & Breeding' },
  { key: 'region', pathTemplate: '/api/v2/region/{idOrName}', category: 'world-encounters', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Regions Atlas & Kanto-Paldea' },
  { key: 'stat', pathTemplate: '/api/v2/stat/{idOrName}', category: 'combat-mechanics', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Base Stats & Nature Matrix' },
  { key: 'super-contest-effect', pathTemplate: '/api/v2/super-contest-effect/{id}', category: 'contests-meta', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Contest Archive' },
  { key: 'type', pathTemplate: '/api/v2/type/{idOrName}', category: 'combat-mechanics', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: '0x-4x Weakness Matrix & STAB' },
  { key: 'version', pathTemplate: '/api/v2/version/{idOrName}', category: 'world-encounters', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Game Version Tags & History' },
  { key: 'version-group', pathTemplate: '/api/v2/version-group/{idOrName}', category: 'world-encounters', cachePolicy: 'static-lookup-7d', implementedInBff: false, targetFeature: 'Generation Ruleset Context' },
  { key: 'pokemon-encounters', pathTemplate: '/api/v2/pokemon/{id}/encounters', category: 'world-encounters', cachePolicy: 'lazy-tab-24h', implementedInBff: false, targetFeature: 'Radar & Capture Chance Tab' },
  { key: 'pokemon-cries', pathTemplate: '/pokemon/cries/{id}', category: 'core-pokemon', cachePolicy: 'hot-redis-24h', implementedInBff: true, targetFeature: 'Web Audio Acoustic Waveform' },
  { key: 'pokemon-sprites-matrix', pathTemplate: '/pokemon/sprites/{id}', category: 'core-pokemon', cachePolicy: 'hot-redis-24h', implementedInBff: true, targetFeature: 'Normal, Shiny & Showdown Renders' },
];

export const PokedexAdvancedQuerySchema = z.object({
  term: z.string().max(80).default(''),
  types: z.array(z.enum(POKEMON_TYPES)).max(2).default([]),
  generation: z.number().int().min(1).max(9).nullable().default(null),
  habitat: z.string().trim().max(40).nullable().default(null),
  onlyLegendary: z.boolean().default(false),
  onlyMythical: z.boolean().default(false),
  onlyBaby: z.boolean().default(false),
  minBst: z.number().int().min(0).max(1200).default(0),
  sortBy: z.enum(['id-asc', 'id-desc', 'name-asc', 'bst-desc']).default('id-asc'),
  limit: z.number().int().min(1).max(1500).default(MAX_CATALOG_RESULTS),
});

export type PokedexAdvancedQuery = z.input<typeof PokedexAdvancedQuerySchema>;

export interface EnrichedCatalogItem extends SearchablePokemonItem {
  readonly types?: readonly PokemonTypeName[];
  readonly generation?: number;
  readonly habitat?: string | null;
  readonly isLegendary?: boolean;
  readonly isMythical?: boolean;
  readonly isBaby?: boolean;
  readonly baseStatTotal?: number;
}

function matchesEnrichedFilters(
  item: EnrichedCatalogItem,
  parsed: z.infer<typeof PokedexAdvancedQuerySchema>,
): boolean {
  if (parsed.types.length > 0) {
    const itemTypes = item.types ?? [];
    if (!parsed.types.every((required) => itemTypes.includes(required))) {
      return false;
    }
  }
  if (parsed.generation !== null && item.generation !== parsed.generation) {
    return false;
  }
  if (parsed.habitat && (item.habitat ?? '').toLowerCase() !== parsed.habitat.toLowerCase()) {
    return false;
  }
  if (parsed.onlyLegendary && !item.isLegendary) {
    return false;
  }
  if (parsed.onlyMythical && !item.isMythical) {
    return false;
  }
  if (parsed.onlyBaby && !item.isBaby) {
    return false;
  }
  if (parsed.minBst > 0 && (item.baseStatTotal ?? 0) < parsed.minBst) {
    return false;
  }
  return true;
}

export function filterCatalogWithAdvancedQuery<T extends EnrichedCatalogItem>(
  catalog: readonly T[],
  rawQuery: PokedexAdvancedQuery,
): readonly T[] {
  const parsed = PokedexAdvancedQuerySchema.parse(rawQuery);
  const byId = new Map<number, T>();
  for (const entry of catalog) {
    byId.set(entry.id, entry);
  }

  let pool: readonly T[];
  if (parsed.term.trim()) {
    const fuzzy = filterPokemonCatalog(catalog, parsed.term, catalog.length);
    pool = fuzzy.items
      .map((match) => byId.get(match.id))
      .filter((entry): entry is T => entry !== undefined);
  } else {
    pool = catalog;
  }

  const filtered = pool.filter((item) => matchesEnrichedFilters(item, parsed));
  const sorted = [...filtered];
  if (parsed.sortBy === 'id-asc') {
    sorted.sort((a, b) => a.id - b.id);
  } else if (parsed.sortBy === 'id-desc') {
    sorted.sort((a, b) => b.id - a.id);
  } else if (parsed.sortBy === 'name-asc') {
    sorted.sort((a, b) => a.displayName.localeCompare(b.displayName));
  } else {
    sorted.sort((a, b) => (b.baseStatTotal ?? 0) - (a.baseStatTotal ?? 0) || a.id - b.id);
  }

  return sorted.slice(0, parsed.limit);
}
