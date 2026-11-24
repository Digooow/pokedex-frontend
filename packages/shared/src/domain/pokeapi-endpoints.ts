import * as z from 'zod';
import {
  MAX_CATALOG_RESULTS,
  POKEMON_TYPES,
  type PokemonTypeName,
} from '../constants/platform.constants';
import { type SearchablePokemonItem, filterPokemonCatalog } from './pokedex-search';

export type PokeApiEndpointCategory =
  | 'core-pokemon'
  | 'evolution-genetics'
  | 'combat-mechanics'
  | 'world-encounters'
  | 'items-berries'
  | 'contests-meta';

export type CacheTierPolicy =
  'hot-redis-24h' | 'lazy-tab-24h' | 'static-lookup-7d' | 'stale-snapshot';

export interface PokeApiEndpointSpec {
  readonly key: string;
  readonly pathTemplate: string;
  readonly category: PokeApiEndpointCategory;
  readonly cachePolicy: CacheTierPolicy;
  readonly implementedInBff: boolean;
  readonly targetFeature: string;
}

const POKEAPI_ENDPOINT_CATALOG_TABLE = `
ability|/api/v2/ability/{idOrName}|combat-mechanics|lazy-tab-24h|false|Pokedex Visor & Battle Engine
berry|/api/v2/berry/{idOrName}|items-berries|lazy-tab-24h|false|Inventory & Held Consumables
berry-firmness|/api/v2/berry-firmness/{idOrName}|items-berries|static-lookup-7d|false|Berry Lab & Crafting
berry-flavor|/api/v2/berry-flavor/{idOrName}|items-berries|static-lookup-7d|false|Nature Affinity & Confusion
characteristic|/api/v2/characteristic/{id}|evolution-genetics|static-lookup-7d|false|Genetic Lab IV Inspector
contest-effect|/api/v2/contest-effect/{id}|contests-meta|static-lookup-7d|false|Pokedex Contest Archive
contest-type|/api/v2/contest-type/{idOrName}|contests-meta|static-lookup-7d|false|Move Appeal Metadata
egg-group|/api/v2/egg-group/{idOrName}|evolution-genetics|static-lookup-7d|false|Replication & Egg Compatibility
encounter-condition|/api/v2/encounter-condition/{idOrName}|world-encounters|static-lookup-7d|false|Spawn Probability Engine
encounter-condition-value|/api/v2/encounter-condition-value/{idOrName}|world-encounters|static-lookup-7d|false|Day/Night & Weather Encounters
encounter-method|/api/v2/encounter-method/{idOrName}|world-encounters|static-lookup-7d|false|Habitat Map & Fishing
evolution-chain|/api/v2/evolution-chain/{id}|evolution-genetics|hot-redis-24h|true|Evolution Tree & Chance Calc
evolution-trigger|/api/v2/evolution-trigger/{idOrName}|evolution-genetics|static-lookup-7d|false|Catalyst & Evolution Conditions
gender|/api/v2/gender/{idOrName}|evolution-genetics|static-lookup-7d|false|Dimorphism & Cloning Fidelity
generation|/api/v2/generation/{idOrName}|world-encounters|static-lookup-7d|true|Advanced Catalog Filter (I-IX)
growth-rate|/api/v2/growth-rate/{idOrName}|evolution-genetics|static-lookup-7d|false|XP Curve & Level Stat Simulator
item|/api/v2/item/{idOrName}|items-berries|lazy-tab-24h|false|Stones, Held Items & Lab Gear
item-attribute|/api/v2/item-attribute/{idOrName}|items-berries|static-lookup-7d|false|Item Filtering
item-category|/api/v2/item-category/{idOrName}|items-berries|static-lookup-7d|false|Catalog & Shop Grouping
item-fling-effect|/api/v2/item-fling-effect/{idOrName}|items-berries|static-lookup-7d|false|Move Fling Resolution
item-pocket|/api/v2/item-pocket/{idOrName}|items-berries|static-lookup-7d|false|Trainer Bag UI
language|/api/v2/language/{idOrName}|contests-meta|static-lookup-7d|false|Multilingual Localization
location|/api/v2/location/{idOrName}|world-encounters|lazy-tab-24h|false|Regions Museum & Radar
location-area|/api/v2/location-area/{idOrName}|world-encounters|lazy-tab-24h|false|Zone Encounter Tables
machine|/api/v2/machine/{id}|combat-mechanics|static-lookup-7d|false|TM/HM Move Acquisition
move|/api/v2/move/{idOrName}|combat-mechanics|lazy-tab-24h|false|Moveset Inspector & Damage Calc
move-ailment|/api/v2/move-ailment/{idOrName}|combat-mechanics|static-lookup-7d|false|Status Effects Engine
move-battle-style|/api/v2/move-battle-style/{idOrName}|combat-mechanics|static-lookup-7d|false|AI Bot Tactical Behavior
move-category|/api/v2/move-category/{idOrName}|combat-mechanics|static-lookup-7d|false|Skill Categorization
move-damage-class|/api/v2/move-damage-class/{idOrName}|combat-mechanics|static-lookup-7d|false|Physical/Special/Status Split
move-learn-method|/api/v2/move-learn-method/{idOrName}|combat-mechanics|static-lookup-7d|false|Learnset Filter Tabs
move-target|/api/v2/move-target/{idOrName}|combat-mechanics|static-lookup-7d|false|Singles/Doubles Target Rules
nature|/api/v2/nature/{idOrName}|combat-mechanics|static-lookup-7d|false|Stat Simulator & Team Builder
pal-park-area|/api/v2/pal-park-area/{idOrName}|world-encounters|static-lookup-7d|false|Legacy Biome Metadata
pokeathlon-stat|/api/v2/pokeathlon-stat/{idOrName}|contests-meta|static-lookup-7d|false|Mini-Game Performance Metrics
pokedex|/api/v2/pokedex/{idOrName}|core-pokemon|static-lookup-7d|false|Regional Pokedex Switching
pokemon|/api/v2/pokemon/{idOrName}|core-pokemon|stale-snapshot|true|Core Pokedex Sheet & Catalog
pokemon-color|/api/v2/pokemon-color/{idOrName}|core-pokemon|static-lookup-7d|true|Visual Color Search Filter
pokemon-form|/api/v2/pokemon-form/{idOrName}|core-pokemon|lazy-tab-24h|true|Forms & Regional Variants UI
pokemon-habitat|/api/v2/pokemon-habitat/{idOrName}|world-encounters|static-lookup-7d|true|Biome Search Filter & Radar
pokemon-shape|/api/v2/pokemon-shape/{idOrName}|core-pokemon|static-lookup-7d|true|Silhouette Filter & Minigame
pokemon-species|/api/v2/pokemon-species/{idOrName}|core-pokemon|stale-snapshot|true|Lore, Capture Rate & Breeding
region|/api/v2/region/{idOrName}|world-encounters|static-lookup-7d|false|Regions Atlas & Kanto-Paldea
stat|/api/v2/stat/{idOrName}|combat-mechanics|static-lookup-7d|false|Base Stats & Nature Matrix
super-contest-effect|/api/v2/super-contest-effect/{id}|contests-meta|static-lookup-7d|false|Contest Archive
type|/api/v2/type/{idOrName}|combat-mechanics|static-lookup-7d|true|0x-4x Weakness Matrix & STAB
version|/api/v2/version/{idOrName}|world-encounters|static-lookup-7d|false|Game Version Tags & History
version-group|/api/v2/version-group/{idOrName}|world-encounters|static-lookup-7d|false|Generation Ruleset Context
pokemon-encounters|/api/v2/pokemon/{id}/encounters|world-encounters|lazy-tab-24h|true|Radar & Capture Chance Tab
pokemon-cries|/pokemon/cries/{id}|core-pokemon|hot-redis-24h|true|Web Audio Acoustic Waveform
pokemon-sprites-matrix|/pokemon/sprites/{id}|core-pokemon|hot-redis-24h|true|Normal, Shiny & Showdown Renders
`;

function buildPokeApiEndpointCatalog(): readonly PokeApiEndpointSpec[] {
  const categorySchema = z.enum([
    'core-pokemon',
    'evolution-genetics',
    'combat-mechanics',
    'world-encounters',
    'items-berries',
    'contests-meta',
  ]);
  const cachePolicySchema = z.enum([
    'hot-redis-24h',
    'lazy-tab-24h',
    'static-lookup-7d',
    'stale-snapshot',
  ]);

  return POKEAPI_ENDPOINT_CATALOG_TABLE.trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((rawLine) => {
      const parts = rawLine.split('|').map((part) => part.trim());
      const [key, pathTemplate, categoryRaw, cachePolicyRaw, implementedRaw, targetFeature] = parts;
      if (parts.length !== 6 || !key || !pathTemplate || !targetFeature) {
        throw new Error(`Invalid PokeAPI endpoint spec row: "${rawLine}"`);
      }
      if (implementedRaw !== 'true' && implementedRaw !== 'false') {
        throw new Error(`Invalid implementedInBff flag in endpoint row: "${rawLine}"`);
      }
      return {
        key,
        pathTemplate,
        category: categorySchema.parse(categoryRaw),
        cachePolicy: cachePolicySchema.parse(cachePolicyRaw),
        implementedInBff: implementedRaw === 'true',
        targetFeature,
      };
    });
}

export const POKEAPI_V2_ENDPOINTS: readonly PokeApiEndpointSpec[] =
  /* @__PURE__ */ buildPokeApiEndpointCatalog();

export const PokedexAdvancedQuerySchema = z.object({
  term: z.string().max(80).default(''),
  types: z.array(z.enum(POKEMON_TYPES)).max(2).default([]),
  generation: z.number().int().min(1).max(9).nullable().default(null),
  habitat: z.string().trim().max(40).nullable().default(null),
  color: z.string().trim().max(40).nullable().default(null),
  shape: z.string().trim().max(40).nullable().default(null),
  onlyLegendary: z.boolean().default(false),
  onlyMythical: z.boolean().default(false),
  onlyBaby: z.boolean().default(false),
  excludeAlternateForms: z.boolean().default(false),
  minBst: z.number().int().min(0).max(1200).default(0),
  sortBy: z.enum(['id-asc', 'id-desc', 'name-asc', 'bst-desc']).default('id-asc'),
  limit: z.number().int().min(1).max(1500).default(MAX_CATALOG_RESULTS),
});

export type PokedexAdvancedQuery = z.input<typeof PokedexAdvancedQuerySchema>;

export interface EnrichedCatalogItem extends SearchablePokemonItem {
  readonly isDefault?: boolean;
  readonly types?: readonly PokemonTypeName[];
  readonly generation?: number;
  readonly habitat?: string | null;
  readonly color?: string | null;
  readonly shape?: string | null;
  readonly isLegendary?: boolean;
  readonly isMythical?: boolean;
  readonly isBaby?: boolean;
  readonly baseStatTotal?: number;
}

function matchesSpeciesFlags(
  item: EnrichedCatalogItem,
  parsed: z.infer<typeof PokedexAdvancedQuerySchema>,
): boolean {
  if (parsed.onlyLegendary && !item.isLegendary) {
    return false;
  }
  if (parsed.onlyMythical && !item.isMythical) {
    return false;
  }
  if (parsed.onlyBaby && !item.isBaby) {
    return false;
  }
  if (parsed.excludeAlternateForms && item.isDefault === false) {
    return false;
  }
  if (parsed.minBst > 0 && (item.baseStatTotal ?? 0) < parsed.minBst) {
    return false;
  }
  return true;
}

function matchesOptionalLabel(actual: string | null | undefined, expected: string | null): boolean {
  if (!expected) {
    return true;
  }
  return (actual ?? '').toLowerCase() === expected.toLowerCase();
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
  if (!matchesOptionalLabel(item.habitat, parsed.habitat)) {
    return false;
  }
  if (!matchesOptionalLabel(item.color, parsed.color)) {
    return false;
  }
  if (!matchesOptionalLabel(item.shape, parsed.shape)) {
    return false;
  }
  return matchesSpeciesFlags(item, parsed);
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
