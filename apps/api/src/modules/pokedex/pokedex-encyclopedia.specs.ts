import {
  type AbilityDetail,
  AbilityDetailSchema,
  type BerryDetail,
  BerryDetailSchema,
  type EggGroupDetail,
  EggGroupDetailSchema,
  type EncyclopediaResourceKey,
  type GrowthRateDetail,
  GrowthRateDetailSchema,
  type ItemDetail,
  ItemDetailSchema,
  type LocationDetail,
  LocationDetailSchema,
  type MoveDetail,
  MoveDetailSchema,
  type NatureSummary,
  NatureSummarySchema,
  type PokedexDetail,
  PokedexDetailSchema,
  type RegionDetail,
  RegionDetailSchema,
  type TypeDetail,
  TypeDetailSchema,
} from '@pokeverse/shared/pokedex-encyclopedia';
import {
  mapRawAbilityToDetail,
  mapRawMoveToDetail,
  mapRawNatureToSummary,
  mapRawTypeToDetail,
} from './pokeapi-encyclopedia-combat.mapper';
import {
  RawPokeApiAbilitySchema,
  RawPokeApiBerrySchema,
  RawPokeApiEggGroupSchema,
  RawPokeApiFullTypeSchema,
  RawPokeApiGrowthRateSchema,
  RawPokeApiItemSchema,
  RawPokeApiLocationSchema,
  RawPokeApiMoveSchema,
  RawPokeApiNatureSchema,
  RawPokeApiPokedexSchema,
  RawPokeApiRegionSchema,
} from './pokeapi-encyclopedia-raw.schemas';
import {
  mapRawBerryToDetail,
  mapRawEggGroupToDetail,
  mapRawGrowthRateToDetail,
  mapRawItemToDetail,
  mapRawLocationToDetail,
  mapRawPokedexToDetail,
  mapRawRegionToDetail,
} from './pokeapi-encyclopedia-world.mapper';
import {
  CACHE_STALE_TTL_14D_SEC,
  CACHE_STALE_TTL_7D_SEC,
  CACHE_TTL_24H_SEC,
  CACHE_TTL_7D_SEC,
} from './pokeapi-http-cache.client';

export interface ResourceTtlConfig {
  readonly ttlSec: number;
  readonly staleTtlSec: number;
}

export const HOT_ENCYCLOPEDIA_TTL: ResourceTtlConfig = {
  ttlSec: CACHE_TTL_24H_SEC,
  staleTtlSec: CACHE_STALE_TTL_7D_SEC,
};

export const STATIC_ENCYCLOPEDIA_TTL: ResourceTtlConfig = {
  ttlSec: CACHE_TTL_7D_SEC,
  staleTtlSec: CACHE_STALE_TTL_14D_SEC,
};

export const ENCYCLOPEDIA_TTL_BY_RESOURCE: Readonly<
  Record<EncyclopediaResourceKey, ResourceTtlConfig>
> = {
  move: HOT_ENCYCLOPEDIA_TTL,
  ability: HOT_ENCYCLOPEDIA_TTL,
  item: HOT_ENCYCLOPEDIA_TTL,
  berry: HOT_ENCYCLOPEDIA_TTL,
  location: HOT_ENCYCLOPEDIA_TTL,
  region: STATIC_ENCYCLOPEDIA_TTL,
  pokedex: STATIC_ENCYCLOPEDIA_TTL,
  'egg-group': STATIC_ENCYCLOPEDIA_TTL,
  'growth-rate': STATIC_ENCYCLOPEDIA_TTL,
  nature: STATIC_ENCYCLOPEDIA_TTL,
  type: STATIC_ENCYCLOPEDIA_TTL,
};

export interface EncyclopediaDetailPayloadMap {
  readonly move: MoveDetail;
  readonly ability: AbilityDetail;
  readonly item: ItemDetail;
  readonly berry: BerryDetail;
  readonly region: RegionDetail;
  readonly pokedex: PokedexDetail;
  readonly location: LocationDetail;
  readonly 'egg-group': EggGroupDetail;
  readonly 'growth-rate': GrowthRateDetail;
  readonly nature: NatureSummary;
  readonly type: TypeDetail;
}

export interface EncyclopediaDetailSpec<TDetail> {
  readonly notFoundMessage: string;
  readonly parseAndMap: (raw: unknown) => TDetail;
  readonly parseDetail: (raw: unknown) => TDetail;
}

export const ENCYCLOPEDIA_DETAIL_SPECS: {
  readonly [K in keyof EncyclopediaDetailPayloadMap]: EncyclopediaDetailSpec<
    EncyclopediaDetailPayloadMap[K]
  >;
} = {
  move: {
    notFoundMessage: 'Golpe não encontrado na PokéAPI.',
    parseAndMap: (raw) => mapRawMoveToDetail(RawPokeApiMoveSchema.parse(raw)),
    parseDetail: (raw) => MoveDetailSchema.parse(raw),
  },
  ability: {
    notFoundMessage: 'Habilidade não encontrada na PokéAPI.',
    parseAndMap: (raw) =>
      mapRawAbilityToDetail(RawPokeApiAbilitySchema.parse(raw)),
    parseDetail: (raw) => AbilityDetailSchema.parse(raw),
  },
  item: {
    notFoundMessage: 'Item não encontrado na PokéAPI.',
    parseAndMap: (raw) => mapRawItemToDetail(RawPokeApiItemSchema.parse(raw)),
    parseDetail: (raw) => ItemDetailSchema.parse(raw),
  },
  berry: {
    notFoundMessage: 'Berry não encontrada na PokéAPI.',
    parseAndMap: (raw) => mapRawBerryToDetail(RawPokeApiBerrySchema.parse(raw)),
    parseDetail: (raw) => BerryDetailSchema.parse(raw),
  },
  region: {
    notFoundMessage: 'Região não encontrada na PokéAPI.',
    parseAndMap: (raw) =>
      mapRawRegionToDetail(RawPokeApiRegionSchema.parse(raw)),
    parseDetail: (raw) => RegionDetailSchema.parse(raw),
  },
  pokedex: {
    notFoundMessage: 'Pokédex regional não encontrada na PokéAPI.',
    parseAndMap: (raw) =>
      mapRawPokedexToDetail(RawPokeApiPokedexSchema.parse(raw)),
    parseDetail: (raw) => PokedexDetailSchema.parse(raw),
  },
  location: {
    notFoundMessage: 'Localização não encontrada na PokéAPI.',
    parseAndMap: (raw) =>
      mapRawLocationToDetail(RawPokeApiLocationSchema.parse(raw)),
    parseDetail: (raw) => LocationDetailSchema.parse(raw),
  },
  'egg-group': {
    notFoundMessage: 'Egg group não encontrado na PokéAPI.',
    parseAndMap: (raw) =>
      mapRawEggGroupToDetail(RawPokeApiEggGroupSchema.parse(raw)),
    parseDetail: (raw) => EggGroupDetailSchema.parse(raw),
  },
  'growth-rate': {
    notFoundMessage: 'Taxa de crescimento não encontrada na PokéAPI.',
    parseAndMap: (raw) =>
      mapRawGrowthRateToDetail(RawPokeApiGrowthRateSchema.parse(raw)),
    parseDetail: (raw) => GrowthRateDetailSchema.parse(raw),
  },
  nature: {
    notFoundMessage: 'Nature não encontrada na PokéAPI.',
    parseAndMap: (raw) =>
      mapRawNatureToSummary(RawPokeApiNatureSchema.parse(raw)),
    parseDetail: (raw) => NatureSummarySchema.parse(raw),
  },
  type: {
    notFoundMessage: 'Tipo elemental não encontrado na PokéAPI.',
    parseAndMap: (raw) =>
      mapRawTypeToDetail(RawPokeApiFullTypeSchema.parse(raw)),
    parseDetail: (raw) => TypeDetailSchema.parse(raw),
  },
};
