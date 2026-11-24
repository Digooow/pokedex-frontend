import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CACHE_STALE_TTL_14D_SEC,
  CACHE_TTL_24H_SEC,
  CACHE_TTL_7D_SEC,
  PokeApiHttpCacheClient,
} from './pokeapi-http-cache.client';
import {
  type RawPokeApiEncounterList,
  RawPokeApiEncounterListSchema,
  type RawPokeApiEvolutionChain,
  RawPokeApiEvolutionChainSchema,
  type RawPokeApiForm,
  RawPokeApiFormSchema,
  type RawPokeApiPokemon,
  RawPokeApiPokemonSchema,
  type RawPokeApiSpecies,
  RawPokeApiSpeciesSchema,
  type RawPokeApiType,
  RawPokeApiTypeSchema,
} from './pokeapi-raw.schemas';

const POKEAPI_V2_BASE = 'https://pokeapi.co/api/v2';

@Injectable()
export class PokeApiResourceFetcher {
  constructor(private readonly httpCache: PokeApiHttpCacheClient) {}

  async fetchRawPokemon(idOrName: string): Promise<RawPokeApiPokemon> {
    const result = await this.httpCache.fetchCachedJson({
      cacheKey: `pokeapi:v2:raw:pokemon:${idOrName}`,
      url: `${POKEAPI_V2_BASE}/pokemon/${encodeURIComponent(idOrName)}`,
      ttlSec: CACHE_TTL_24H_SEC,
      staleTtlSec: 0,
      notFoundMessage: 'Pokémon não encontrado na PokéAPI.',
      parse: (raw) => RawPokeApiPokemonSchema.parse(raw),
      aliasKeys: (p) => [`pokeapi:v2:raw:pokemon:${p.id}`],
      recordMetrics: false,
    });
    return result.data;
  }

  async fetchRawSpecies(idOrName: string): Promise<RawPokeApiSpecies> {
    const result = await this.httpCache.fetchCachedJson({
      cacheKey: `pokeapi:v2:raw:species:${idOrName}`,
      url: `${POKEAPI_V2_BASE}/pokemon-species/${encodeURIComponent(idOrName)}`,
      ttlSec: CACHE_TTL_24H_SEC,
      staleTtlSec: 0,
      notFoundMessage: 'Espécie de Pokémon não encontrada na PokéAPI.',
      parse: (raw) => RawPokeApiSpeciesSchema.parse(raw),
      aliasKeys: (s) => [`pokeapi:v2:raw:species:${s.id}`],
      recordMetrics: false,
    });
    return result.data;
  }

  async tryFetchRawSpecies(
    idOrName: string,
  ): Promise<RawPokeApiSpecies | null> {
    try {
      return await this.fetchRawSpecies(idOrName);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return null;
      }
      throw error;
    }
  }

  async fetchRawEvolutionChain(
    chainId: number,
  ): Promise<RawPokeApiEvolutionChain> {
    const result = await this.httpCache.fetchCachedJson({
      cacheKey: `pokeapi:v2:raw:evolution-chain:${chainId}`,
      url: `${POKEAPI_V2_BASE}/evolution-chain/${chainId}`,
      ttlSec: CACHE_TTL_24H_SEC,
      staleTtlSec: 0,
      notFoundMessage: 'Cadeia evolutiva não encontrada na PokéAPI.',
      parse: (raw) => RawPokeApiEvolutionChainSchema.parse(raw),
      recordMetrics: false,
    });
    return result.data;
  }

  async fetchRawType(typeName: string): Promise<RawPokeApiType> {
    const result = await this.httpCache.fetchCachedJson({
      cacheKey: `pokeapi:v2:raw:type:${typeName}`,
      url: `${POKEAPI_V2_BASE}/type/${encodeURIComponent(typeName)}`,
      ttlSec: CACHE_TTL_7D_SEC,
      staleTtlSec: CACHE_STALE_TTL_14D_SEC,
      notFoundMessage: `Tipo ${typeName} não encontrado na PokéAPI.`,
      parse: (raw) => RawPokeApiTypeSchema.parse(raw),
      recordMetrics: false,
    });
    return result.data;
  }

  async fetchRawEncounters(
    pokemonId: number,
  ): Promise<RawPokeApiEncounterList> {
    const result = await this.httpCache.fetchCachedJson({
      cacheKey: `pokeapi:v2:raw:encounters:${pokemonId}`,
      url: `${POKEAPI_V2_BASE}/pokemon/${pokemonId}/encounters`,
      ttlSec: CACHE_TTL_24H_SEC,
      staleTtlSec: 0,
      notFoundMessage: 'Locais de encontro não encontrados na PokéAPI.',
      parse: (raw) => RawPokeApiEncounterListSchema.parse(raw),
      recordMetrics: false,
    });
    return result.data;
  }

  async tryFetchRawForm(formSlug: string): Promise<RawPokeApiForm | null> {
    try {
      const result = await this.httpCache.fetchCachedJson({
        cacheKey: `pokeapi:v2:raw:form:${formSlug}`,
        url: `${POKEAPI_V2_BASE}/pokemon-form/${encodeURIComponent(formSlug)}`,
        ttlSec: CACHE_TTL_24H_SEC,
        staleTtlSec: 0,
        notFoundMessage: `Forma ${formSlug} não encontrada na PokéAPI.`,
        parse: (raw) => RawPokeApiFormSchema.parse(raw),
        recordMetrics: false,
      });
      return result.data;
    } catch (error) {
      if (error instanceof NotFoundException) {
        return null;
      }
      throw error;
    }
  }
}
