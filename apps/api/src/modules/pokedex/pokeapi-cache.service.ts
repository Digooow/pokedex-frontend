import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type CachedCatalogResponse,
  type CachedPokemonResponse,
  PokeApiCatalogResponseSchema,
  PokemonDetailSchema,
  PokemonIdentifierParamSchema,
} from '@pokeverse/shared';
import {
  CACHE_STALE_TTL_7D_SEC,
  CACHE_TTL_24H_SEC,
  PokeApiHttpCacheClient,
} from './pokeapi-http-cache.client';

const POKEAPI_CATALOG_URL =
  'https://pokeapi.co/api/v2/pokemon?limit=100000&offset=0';
const POKEAPI_POKEMON_BASE = 'https://pokeapi.co/api/v2/pokemon/';

@Injectable()
export class PokeApiCacheService {
  constructor(private readonly httpCache: PokeApiHttpCacheClient) {}

  async getCatalog(): Promise<CachedCatalogResponse> {
    const result = await this.httpCache.fetchCachedJson({
      cacheKey: 'pokeapi:v2:catalog',
      url: POKEAPI_CATALOG_URL,
      ttlSec: CACHE_TTL_24H_SEC,
      staleTtlSec: CACHE_STALE_TTL_7D_SEC,
      notFoundMessage: 'Catálogo da PokéAPI não encontrado.',
      parse: (raw) => PokeApiCatalogResponseSchema.parse(raw),
    });
    return { cache: result.cache, catalog: result.data };
  }

  async getPokemon(rawIdOrName: string): Promise<CachedPokemonResponse> {
    const parsed = PokemonIdentifierParamSchema.safeParse(rawIdOrName);
    if (!parsed.success) {
      throw new BadRequestException('Identificador de Pokémon inválido.');
    }

    const normalized = parsed.data;
    const result = await this.httpCache.fetchCachedJson({
      cacheKey: `pokeapi:v2:pokemon:${normalized}`,
      url: `${POKEAPI_POKEMON_BASE}${encodeURIComponent(normalized)}`,
      ttlSec: CACHE_TTL_24H_SEC,
      staleTtlSec: CACHE_STALE_TTL_7D_SEC,
      notFoundMessage: 'Pokémon não encontrado na PokéAPI.',
      parse: (raw) => PokemonDetailSchema.parse(raw),
      aliasKeys: (pokemon) => [`pokeapi:v2:pokemon:${pokemon.id}`],
    });
    return { cache: result.cache, pokemon: result.data };
  }
}
