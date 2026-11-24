import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PokeApiCatalogResponseSchema,
  PokemonIdentifierParamSchema,
} from '@pokeverse/shared';
import {
  type CachedAbilityDetailResponse,
  type CachedBerryDetailResponse,
  type CachedEggGroupDetailResponse,
  type CachedEncyclopediaListResponse,
  CachedEncyclopediaListResponseSchema,
  type CachedGrowthRateDetailResponse,
  type CachedItemDetailResponse,
  type CachedLocationDetailResponse,
  type CachedMoveDetailResponse,
  type CachedNatureDetailResponse,
  type CachedNaturesListResponse,
  type CachedPokedexDetailResponse,
  type CachedRegionDetailResponse,
  type CachedTypeDetailResponse,
  type CachedTypesListResponse,
  type EncyclopediaListEntry,
  EncyclopediaListEntrySchema,
  type EncyclopediaPaginationQuery,
  type EncyclopediaResourceKey,
  type NatureSummary,
  NatureSummarySchema,
  type TypeSummary,
  TypeSummarySchema,
} from '@pokeverse/shared/pokedex-encyclopedia';
import { z } from 'zod';
import {
  mapNamedResourceEntries,
  mapRawNatureToSummary,
  mapRawTypeToSummary,
} from './pokeapi-encyclopedia-combat.mapper';
import {
  RawPokeApiFullTypeSchema,
  RawPokeApiNatureSchema,
} from './pokeapi-encyclopedia-raw.schemas';
import {
  CACHE_STALE_TTL_14D_SEC,
  CACHE_TTL_7D_SEC,
  PokeApiHttpCacheClient,
} from './pokeapi-http-cache.client';
import {
  ENCYCLOPEDIA_DETAIL_SPECS,
  ENCYCLOPEDIA_TTL_BY_RESOURCE,
  type EncyclopediaDetailPayloadMap,
  type ResourceTtlConfig,
  STATIC_ENCYCLOPEDIA_TTL,
} from './pokedex-encyclopedia.specs';

const POKEAPI_V2_BASE = 'https://pokeapi.co/api/v2';
const RESOURCE_LIST_LIMIT = 3000;
const STATIC_LIST_LIMIT = 100;
const DETAIL_BATCH_SIZE = 6;

const EncyclopediaIndexListSchema = z.array(EncyclopediaListEntrySchema);
const NaturesListSchema = z.array(NatureSummarySchema);
const TypesListSchema = z.array(TypeSummarySchema);

@Injectable()
export class PokedexEncyclopediaService {
  constructor(private readonly httpCache: PokeApiHttpCacheClient) {}

  async listResource(
    resource: EncyclopediaResourceKey,
    query: EncyclopediaPaginationQuery,
  ): Promise<CachedEncyclopediaListResponse> {
    const ttl = ENCYCLOPEDIA_TTL_BY_RESOURCE[resource];
    const index = await this.httpCache.getCachedOrCompute({
      cacheKey: `pokeapi:v2:encyclopedia:index:${resource}`,
      ttlSec: ttl.ttlSec,
      staleTtlSec: ttl.staleTtlSec,
      parse: (raw) => EncyclopediaIndexListSchema.parse(raw),
      compute: () => this.fetchIndexEntries(resource, RESOURCE_LIST_LIMIT, ttl),
    });

    const filtered = this.filterIndexEntries(index.data, query.q);
    const items = filtered.slice(query.offset, query.offset + query.limit);

    return CachedEncyclopediaListResponseSchema.parse({
      cache: index.cache,
      resource,
      total: filtered.length,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + items.length < filtered.length,
      items,
    });
  }

  async listNatures(): Promise<CachedNaturesListResponse> {
    const result = await this.httpCache.getCachedOrCompute({
      cacheKey: 'pokeapi:v2:encyclopedia:natures:all',
      ttlSec: CACHE_TTL_7D_SEC,
      staleTtlSec: CACHE_STALE_TTL_14D_SEC,
      parse: (raw) => NaturesListSchema.parse(raw),
      compute: () => this.computeAllNatures(),
    });
    return {
      cache: result.cache,
      total: result.data.length,
      natures: result.data,
    };
  }

  async listTypes(): Promise<CachedTypesListResponse> {
    const result = await this.httpCache.getCachedOrCompute({
      cacheKey: 'pokeapi:v2:encyclopedia:types:all',
      ttlSec: CACHE_TTL_7D_SEC,
      staleTtlSec: CACHE_STALE_TTL_14D_SEC,
      parse: (raw) => TypesListSchema.parse(raw),
      compute: () => this.computeAllTypes(),
    });
    return {
      cache: result.cache,
      total: result.data.length,
      types: result.data,
    };
  }

  async getMove(rawIdOrName: string): Promise<CachedMoveDetailResponse> {
    const result = await this.fetchResourceDetail('move', rawIdOrName);
    return { cache: result.cache, move: result.data };
  }

  async getAbility(rawIdOrName: string): Promise<CachedAbilityDetailResponse> {
    const result = await this.fetchResourceDetail('ability', rawIdOrName);
    return { cache: result.cache, ability: result.data };
  }

  async getItem(rawIdOrName: string): Promise<CachedItemDetailResponse> {
    const result = await this.fetchResourceDetail('item', rawIdOrName);
    return { cache: result.cache, item: result.data };
  }

  async getBerry(rawIdOrName: string): Promise<CachedBerryDetailResponse> {
    const result = await this.fetchResourceDetail('berry', rawIdOrName);
    return { cache: result.cache, berry: result.data };
  }

  async getRegion(rawIdOrName: string): Promise<CachedRegionDetailResponse> {
    const result = await this.fetchResourceDetail('region', rawIdOrName);
    return { cache: result.cache, region: result.data };
  }

  async getPokedex(rawIdOrName: string): Promise<CachedPokedexDetailResponse> {
    const result = await this.fetchResourceDetail('pokedex', rawIdOrName);
    return { cache: result.cache, pokedex: result.data };
  }

  async getLocation(
    rawIdOrName: string,
  ): Promise<CachedLocationDetailResponse> {
    const result = await this.fetchResourceDetail('location', rawIdOrName);
    return { cache: result.cache, location: result.data };
  }

  async getEggGroup(
    rawIdOrName: string,
  ): Promise<CachedEggGroupDetailResponse> {
    const result = await this.fetchResourceDetail('egg-group', rawIdOrName);
    return { cache: result.cache, eggGroup: result.data };
  }

  async getGrowthRate(
    rawIdOrName: string,
  ): Promise<CachedGrowthRateDetailResponse> {
    const result = await this.fetchResourceDetail('growth-rate', rawIdOrName);
    return { cache: result.cache, growthRate: result.data };
  }

  async getNature(rawIdOrName: string): Promise<CachedNatureDetailResponse> {
    const result = await this.fetchResourceDetail('nature', rawIdOrName);
    return { cache: result.cache, nature: result.data };
  }

  async getType(rawIdOrName: string): Promise<CachedTypeDetailResponse> {
    const result = await this.fetchResourceDetail('type', rawIdOrName);
    return { cache: result.cache, type: result.data };
  }

  private normalizeIdentifier(rawIdOrName: string): string {
    const parsed = PokemonIdentifierParamSchema.safeParse(rawIdOrName);
    if (!parsed.success) {
      throw new BadRequestException('Identificador de recurso inválido.');
    }
    return parsed.data;
  }

  private filterIndexEntries(
    entries: readonly EncyclopediaListEntry[],
    rawQuery: string,
  ): readonly EncyclopediaListEntry[] {
    const term = rawQuery.trim().toLowerCase();
    if (!term) {
      return entries;
    }
    return entries.filter(
      (entry) => entry.name.includes(term) || String(entry.id) === term,
    );
  }

  private async fetchIndexEntries(
    resource: EncyclopediaResourceKey,
    limit: number,
    ttl: ResourceTtlConfig,
  ): Promise<EncyclopediaListEntry[]> {
    const rawCatalog = await this.httpCache.fetchCachedJson({
      cacheKey: `pokeapi:v2:raw:encyclopedia:index:${resource}`,
      url: `${POKEAPI_V2_BASE}/${resource}?limit=${limit}&offset=0`,
      ttlSec: ttl.ttlSec,
      staleTtlSec: 0,
      notFoundMessage: `Lista ${resource} não encontrada na PokéAPI.`,
      parse: (raw) => PokeApiCatalogResponseSchema.parse(raw),
      recordMetrics: false,
    });
    return mapNamedResourceEntries(rawCatalog.data.results);
  }

  private async fetchRawResource(
    resource: EncyclopediaResourceKey,
    idOrName: string,
    notFoundMessage: string,
  ): Promise<unknown> {
    const ttl = ENCYCLOPEDIA_TTL_BY_RESOURCE[resource];
    const result = await this.httpCache.fetchCachedJson({
      cacheKey: `pokeapi:v2:raw:encyclopedia:${resource}:${idOrName}`,
      url: `${POKEAPI_V2_BASE}/${resource}/${encodeURIComponent(idOrName)}`,
      ttlSec: ttl.ttlSec,
      staleTtlSec: 0,
      notFoundMessage,
      parse: (raw) => raw,
      recordMetrics: false,
    });
    return result.data;
  }

  private fetchResourceDetail<K extends keyof EncyclopediaDetailPayloadMap>(
    resource: K,
    rawIdOrName: string,
  ) {
    const normalized = this.normalizeIdentifier(rawIdOrName);
    const ttl = ENCYCLOPEDIA_TTL_BY_RESOURCE[resource];
    const spec = ENCYCLOPEDIA_DETAIL_SPECS[resource];
    return this.httpCache.getCachedOrCompute<EncyclopediaDetailPayloadMap[K]>({
      cacheKey: `pokeapi:v2:encyclopedia:${resource}:${normalized}`,
      ttlSec: ttl.ttlSec,
      staleTtlSec: ttl.staleTtlSec,
      parse: spec.parseDetail,
      aliasKeys: (detail) => [
        `pokeapi:v2:encyclopedia:${resource}:${detail.id}`,
        `pokeapi:v2:encyclopedia:${resource}:${detail.name}`,
      ],
      compute: async () => {
        const raw = await this.fetchRawResource(
          resource,
          normalized,
          spec.notFoundMessage,
        );
        return spec.parseAndMap(raw);
      },
    });
  }

  private fetchInBatches<TInput, TOutput>(
    items: readonly TInput[],
    worker: (item: TInput) => Promise<TOutput>,
  ): Promise<TOutput[]> {
    const output: TOutput[] = [];
    const runFrom = async (offset: number): Promise<TOutput[]> => {
      if (offset >= items.length) {
        return output;
      }
      const batch = items.slice(offset, offset + DETAIL_BATCH_SIZE);
      const resolved = await Promise.all(batch.map((item) => worker(item)));
      output.push(...resolved);
      return runFrom(offset + DETAIL_BATCH_SIZE);
    };
    return runFrom(0);
  }

  private async computeAllNatures(): Promise<NatureSummary[]> {
    const index = await this.fetchIndexEntries(
      'nature',
      STATIC_LIST_LIMIT,
      STATIC_ENCYCLOPEDIA_TTL,
    );
    const items = await this.fetchInBatches(index, async (entry) => {
      const raw = await this.fetchRawResource(
        'nature',
        String(entry.id),
        'Nature não encontrada na PokéAPI.',
      );
      return mapRawNatureToSummary(RawPokeApiNatureSchema.parse(raw));
    });
    return items.sort((a, b) => a.id - b.id);
  }

  private async computeAllTypes(): Promise<TypeSummary[]> {
    const index = await this.fetchIndexEntries(
      'type',
      STATIC_LIST_LIMIT,
      STATIC_ENCYCLOPEDIA_TTL,
    );
    const items = await this.fetchInBatches(index, async (entry) => {
      const raw = await this.fetchRawResource(
        'type',
        String(entry.id),
        'Tipo elemental não encontrado na PokéAPI.',
      );
      return mapRawTypeToSummary(RawPokeApiFullTypeSchema.parse(raw));
    });
    return items.sort((a, b) => a.id - b.id);
  }
}
