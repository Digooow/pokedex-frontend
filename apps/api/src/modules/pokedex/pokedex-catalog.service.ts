import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PokeApiCatalogResponseSchema } from '@pokeverse/shared';
import {
  type CachedEnrichedCatalogResponse,
  type CachedPokedexMetaFiltersResponse,
  type EnrichedCatalogPayload,
  EnrichedCatalogPayloadSchema,
  type PokedexMetaFilters,
  PokedexMetaFiltersSchema,
} from '@pokeverse/shared/pokedex-encyclopedia';
import { PokeApiCacheService } from './pokeapi-cache.service';
import {
  mapGraphQlCatalogToEnriched,
  mapGraphQlMetaToFilters,
  mapRestCatalogToDegradedEnriched,
  mapRestListsToMetaFilters,
} from './pokeapi-catalog.mapper';
import {
  CACHE_STALE_TTL_14D_SEC,
  CACHE_STALE_TTL_7D_SEC,
  CACHE_TTL_24H_SEC,
  CACHE_TTL_7D_SEC,
  type CachedResourceResult,
  PokeApiHttpCacheClient,
} from './pokeapi-http-cache.client';

const POKEAPI_GRAPHQL_URL = 'https://graphql.pokeapi.co/v1beta2';
const POKEAPI_V2_BASE = 'https://pokeapi.co/api/v2';
const ENRICHED_CATALOG_CACHE_KEY = 'pokeapi:v2:catalog:enriched';
const META_FILTERS_CACHE_KEY = 'pokeapi:v2:meta:filters';

const ENRICHED_CATALOG_QUERY = `
query EnrichedPokedexCatalog {
  pokemon(order_by: { id: asc }) {
    id
    name
    is_default
    pokemontypes(order_by: { slot: asc }) {
      slot
      type {
        name
      }
    }
    pokemonstats {
      base_stat
    }
    pokemonspecy {
      generation_id
      is_legendary
      is_mythical
      is_baby
      pokemonhabitat {
        name
      }
      pokemoncolor {
        name
      }
      pokemonshape {
        name
      }
      pokemonegggroups {
        egggroup {
          name
        }
      }
    }
  }
}
`;

const META_FILTERS_QUERY = `
query PokedexMetaFilters {
  generation(order_by: { id: asc }) {
    id
    name
    region {
      name
    }
  }
  pokemonhabitat(order_by: { id: asc }) {
    id
    name
  }
  pokemoncolor(order_by: { id: asc }) {
    id
    name
  }
  pokemonshape(order_by: { id: asc }) {
    id
    name
  }
  egggroup(order_by: { id: asc }) {
    id
    name
  }
  growthrate(order_by: { id: asc }) {
    id
    name
  }
  region(order_by: { id: asc }) {
    id
    name
  }
  type(order_by: { id: asc }) {
    id
    name
  }
}
`;

@Injectable()
export class PokedexCatalogService {
  constructor(
    private readonly httpCache: PokeApiHttpCacheClient,
    private readonly pokeApiCache: PokeApiCacheService,
  ) {}

  async getEnrichedCatalog(): Promise<CachedEnrichedCatalogResponse> {
    const cached = await this.httpCache.readFreshCache(
      ENRICHED_CATALOG_CACHE_KEY,
      (raw) => EnrichedCatalogPayloadSchema.parse(raw),
    );
    if (cached !== null) {
      this.httpCache.recordCacheMetric('hit');
      return { cache: 'hit', ...cached };
    }

    const result = await this.httpCache.runSingleflight(
      ENRICHED_CATALOG_CACHE_KEY,
      () => this.resolveEnrichedCatalog(),
    );
    return { cache: result.cache, ...result.data };
  }

  async getMetaFilters(): Promise<CachedPokedexMetaFiltersResponse> {
    const result = await this.httpCache.getCachedOrCompute({
      cacheKey: META_FILTERS_CACHE_KEY,
      ttlSec: CACHE_TTL_7D_SEC,
      staleTtlSec: CACHE_STALE_TTL_14D_SEC,
      parse: (raw) => PokedexMetaFiltersSchema.parse(raw),
      compute: () => this.computeMetaFilters(),
    });
    return { cache: result.cache, filters: result.data };
  }

  private async resolveEnrichedCatalog(): Promise<
    CachedResourceResult<EnrichedCatalogPayload>
  > {
    try {
      const raw = await this.httpCache.postUpstreamJson(
        POKEAPI_GRAPHQL_URL,
        { query: ENRICHED_CATALOG_QUERY },
        ['graphql.pokeapi.co'],
      );
      const payload = mapGraphQlCatalogToEnriched(raw);
      await this.httpCache.writeCache(
        ENRICHED_CATALOG_CACHE_KEY,
        CACHE_TTL_24H_SEC,
        CACHE_STALE_TTL_7D_SEC,
        payload,
      );
      this.httpCache.recordCacheMetric('miss');
      return { cache: 'miss', data: payload };
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) {
        throw error;
      }
      return this.resolveEnrichedFallback();
    }
  }

  private async resolveEnrichedFallback(): Promise<
    CachedResourceResult<EnrichedCatalogPayload>
  > {
    const stale = await this.httpCache.readStaleCache(
      ENRICHED_CATALOG_CACHE_KEY,
      (raw) => EnrichedCatalogPayloadSchema.parse(raw),
    );
    if (stale !== null) {
      this.httpCache.recordCacheMetric('stale-fallback');
      return { cache: 'stale-fallback', data: stale };
    }

    const rest = await this.pokeApiCache.getCatalog();
    return {
      cache: rest.cache,
      data: mapRestCatalogToDegradedEnriched(rest.catalog),
    };
  }

  private async computeMetaFilters(): Promise<PokedexMetaFilters> {
    try {
      const raw = await this.httpCache.postUpstreamJson(
        POKEAPI_GRAPHQL_URL,
        { query: META_FILTERS_QUERY },
        ['graphql.pokeapi.co'],
      );
      return mapGraphQlMetaToFilters(raw);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) {
        throw error;
      }
      return this.fetchRestMetaFilters();
    }
  }

  private async fetchRestMetaFilters(): Promise<PokedexMetaFilters> {
    const [
      generations,
      habitats,
      colors,
      shapes,
      eggGroups,
      growthRates,
      regions,
      types,
    ] = await Promise.all([
      this.fetchRestMetaList('generation'),
      this.fetchRestMetaList('pokemon-habitat'),
      this.fetchRestMetaList('pokemon-color'),
      this.fetchRestMetaList('pokemon-shape'),
      this.fetchRestMetaList('egg-group'),
      this.fetchRestMetaList('growth-rate'),
      this.fetchRestMetaList('region'),
      this.fetchRestMetaList('type'),
    ]);

    return mapRestListsToMetaFilters({
      generations,
      habitats,
      colors,
      shapes,
      eggGroups,
      growthRates,
      regions,
      types,
    });
  }

  private async fetchRestMetaList(resource: string) {
    const result = await this.httpCache.fetchCachedJson({
      cacheKey: `pokeapi:v2:raw:meta-list:${resource}`,
      url: `${POKEAPI_V2_BASE}/${resource}?limit=100&offset=0`,
      ttlSec: CACHE_TTL_7D_SEC,
      staleTtlSec: 0,
      notFoundMessage: `Lista de metadados ${resource} não encontrada na PokéAPI.`,
      parse: (raw) => PokeApiCatalogResponseSchema.parse(raw),
      recordMetrics: false,
    });
    return result.data;
  }
}
