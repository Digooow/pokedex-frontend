import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type CachedCatalogResponse,
  type CachedPokemonResponse,
  type PokeApiCatalogResponse,
  PokeApiCatalogResponseSchema,
  type PokemonDetailDto,
  PokemonDetailSchema,
  PokemonIdentifierParamSchema,
  formatPokeApiText,
} from '@pokeverse/shared';
import { assertSafeOutboundUrl } from '../../common/http/safe-outbound-http';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import { RedisService } from '../../infra/redis.service';

const POKEAPI_CATALOG_URL =
  'https://pokeapi.co/api/v2/pokemon?limit=100000&offset=0';
const POKEAPI_POKEMON_BASE = 'https://pokeapi.co/api/v2/pokemon/';
const CACHE_TTL_24H_SEC = 86_400;
const CACHE_STALE_TTL_7D_SEC = 604_800;
const CB_FAILURE_THRESHOLD = 3;
const CB_OPEN_COOLDOWN_MS = 30_000;

@Injectable()
export class PokeApiCacheService {
  private readonly inflightCatalog = new Map<
    string,
    Promise<CachedCatalogResponse>
  >();
  private readonly inflightPokemon = new Map<
    string,
    Promise<CachedPokemonResponse>
  >();
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService<ApiEnvConfig, true>,
    private readonly logger: StructuredLoggerService,
  ) {}

  async getCatalog(): Promise<CachedCatalogResponse> {
    const cacheKey = 'pokeapi:v2:catalog';
    const cached = await this.safeRedisGet(
      cacheKey,
      PokeApiCatalogResponseSchema,
    );
    if (cached) {
      return { cache: 'hit', catalog: cached };
    }

    const existingInflight = this.inflightCatalog.get(cacheKey);
    if (existingInflight) {
      return existingInflight;
    }

    const request = this.fetchAndCacheCatalog(cacheKey).finally(() => {
      this.inflightCatalog.delete(cacheKey);
    });
    this.inflightCatalog.set(cacheKey, request);
    return request;
  }

  async getPokemon(rawIdOrName: string): Promise<CachedPokemonResponse> {
    const parsed = PokemonIdentifierParamSchema.safeParse(rawIdOrName);
    if (!parsed.success) {
      throw new BadRequestException('Identificador de Pokémon inválido.');
    }

    const normalized = parsed.data;

    const cacheKey = `pokeapi:v2:pokemon:${normalized}`;
    const cached = await this.safeRedisGet(cacheKey, PokemonDetailSchema);
    if (cached) {
      return { cache: 'hit', pokemon: cached };
    }

    const existingInflight = this.inflightPokemon.get(cacheKey);
    if (existingInflight) {
      return existingInflight;
    }

    const request = this.fetchAndCachePokemon(normalized, cacheKey).finally(
      () => {
        this.inflightPokemon.delete(cacheKey);
      },
    );
    this.inflightPokemon.set(cacheKey, request);
    return request;
  }

  private async fetchAndCacheCatalog(
    cacheKey: string,
  ): Promise<CachedCatalogResponse> {
    try {
      const raw = await this.fetchUpstreamJson(POKEAPI_CATALOG_URL);
      const parsed = PokeApiCatalogResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ServiceUnavailableException(
          'Resposta inesperada da PokéAPI ao carregar catálogo.',
        );
      }

      await this.safeRedisSet(cacheKey, parsed.data);
      return { cache: 'miss', catalog: parsed.data };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        const stale = await this.safeRedisGet(
          `${cacheKey}:stale`,
          PokeApiCatalogResponseSchema,
        );
        if (stale) {
          return { cache: 'stale-fallback', catalog: stale };
        }
      }
      throw error;
    }
  }

  private async fetchAndCachePokemon(
    normalized: string,
    cacheKey: string,
  ): Promise<CachedPokemonResponse> {
    try {
      const url = `${POKEAPI_POKEMON_BASE}${encodeURIComponent(normalized)}`;
      const raw = await this.fetchUpstreamJson(url);
      const parsed = PokemonDetailSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ServiceUnavailableException(
          `Resposta inesperada da PokéAPI para ${formatPokeApiText(normalized)}.`,
        );
      }

      await this.safeRedisSet(cacheKey, parsed.data);
      if (String(parsed.data.id) !== normalized) {
        await this.safeRedisSet(
          `pokeapi:v2:pokemon:${parsed.data.id}`,
          parsed.data,
        );
      }
      return { cache: 'miss', pokemon: parsed.data };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        const stale = await this.safeRedisGet(
          `${cacheKey}:stale`,
          PokemonDetailSchema,
        );
        if (stale) {
          return { cache: 'stale-fallback', pokemon: stale };
        }
      }
      throw error;
    }
  }

  private async fetchUpstreamJson(url: string): Promise<unknown> {
    if (Date.now() < this.circuitOpenUntil) {
      throw new ServiceUnavailableException(
        'PokéAPI temporariamente protegida por Circuit Breaker. Tente em instantes.',
      );
    }

    const timeoutMs = this.config.get('POKEAPI_TIMEOUT_MS', { infer: true });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const safeUrl = await assertSafeOutboundUrl(url, ['pokeapi.co']);
      const response = await fetch(safeUrl.toString(), {
        signal: controller.signal,
        redirect: 'error',
        headers: { accept: 'application/json' },
      });

      if (response.status === 404) {
        this.consecutiveFailures = 0;
        throw new NotFoundException('Pokémon não encontrado na PokéAPI.');
      }

      if (!response.ok) {
        throw new ServiceUnavailableException(
          `PokéAPI retornou HTTP ${response.status}.`,
        );
      }

      this.consecutiveFailures = 0;
      this.circuitOpenUntil = 0;
      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= CB_FAILURE_THRESHOLD) {
        this.circuitOpenUntil = Date.now() + CB_OPEN_COOLDOWN_MS;
        this.logger.emitEvent(
          'warn',
          'Circuit breaker opened for PokéAPI upstream',
          {
            context: PokeApiCacheService.name,
            errorCode: 'POKEAPI_CIRCUIT_OPEN',
          },
        );
      }

      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException(
        'Falha de comunicação com a PokéAPI externa.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async safeRedisGet<T>(
    key: string,
    schema: {
      safeParse: (
        input: unknown,
      ) => { success: true; data: T } | { success: false };
    },
  ): Promise<T | null> {
    try {
      const raw = await this.redis.getJson<unknown>(key);
      if (!raw) {
        return null;
      }
      const parsed = schema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private async safeRedisSet(
    key: string,
    value: PokeApiCatalogResponse | PokemonDetailDto,
  ): Promise<void> {
    try {
      await this.redis.setJsonEx(key, CACHE_TTL_24H_SEC, value);
      await this.redis.setJsonEx(`${key}:stale`, CACHE_STALE_TTL_7D_SEC, value);
    } catch {
      return;
    }
  }
}
