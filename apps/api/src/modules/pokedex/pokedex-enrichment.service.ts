import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type CachedPokemonBundleResponse,
  type CachedPokemonEncountersResponse,
  CachedPokemonEncountersResponseSchema,
  type CachedPokemonFormsResponse,
  CachedPokemonFormsResponseSchema,
  type EvolutionChainSummary,
  type PokemonBundle,
  PokemonBundleSchema,
  type PokemonFormItem,
  PokemonIdentifierParamSchema,
  type TypeDamageRelationInput,
  computeDefensiveTypeEffectiveness,
} from '@pokeverse/shared';
import { mapRawPokemonToBundle } from './pokeapi-bundle.mapper';
import {
  extractPokeApiId,
  mapRawEncounters,
  mapRawEvolutionChain,
  mapRawForm,
  mapRawSpeciesToBundle,
  mapSpeciesVarieties,
} from './pokeapi-details.mapper';
import {
  CACHE_STALE_TTL_7D_SEC,
  CACHE_TTL_24H_SEC,
  PokeApiHttpCacheClient,
} from './pokeapi-http-cache.client';
import type { RawPokeApiPokemon } from './pokeapi-raw.schemas';
import { PokeApiResourceFetcher } from './pokeapi-resource.fetcher';

const MAX_FORMS_PER_POKEMON = 32;
const FORM_FETCH_BATCH_SIZE = 6;

@Injectable()
export class PokedexEnrichmentService {
  constructor(
    private readonly httpCache: PokeApiHttpCacheClient,
    private readonly fetcher: PokeApiResourceFetcher,
  ) {}

  async getPokemonBundle(
    rawIdOrName: string,
  ): Promise<CachedPokemonBundleResponse> {
    const normalized = this.normalizeIdentifier(rawIdOrName);
    const result = await this.httpCache.getCachedOrCompute({
      cacheKey: `pokeapi:v2:bundle:${normalized}`,
      ttlSec: CACHE_TTL_24H_SEC,
      staleTtlSec: CACHE_STALE_TTL_7D_SEC,
      parse: (raw) => PokemonBundleSchema.parse(raw),
      aliasKeys: (bundle) => [
        `pokeapi:v2:bundle:${bundle.pokemon.id}`,
        `pokeapi:v2:bundle:${bundle.pokemon.name}`,
      ],
      compute: () => this.buildPokemonBundle(normalized),
    });

    return { cache: result.cache, bundle: result.data };
  }

  async getPokemonEncounters(
    rawIdOrName: string,
  ): Promise<CachedPokemonEncountersResponse> {
    const normalized = this.normalizeIdentifier(rawIdOrName);
    const result = await this.httpCache.getCachedOrCompute({
      cacheKey: `pokeapi:v2:encounters:${normalized}`,
      ttlSec: CACHE_TTL_24H_SEC,
      staleTtlSec: CACHE_STALE_TTL_7D_SEC,
      parse: (raw) =>
        CachedPokemonEncountersResponseSchema.omit({ cache: true }).parse(raw),
      aliasKeys: (payload) => [
        `pokeapi:v2:encounters:${payload.pokemonId}`,
        `pokeapi:v2:encounters:${payload.pokemonName}`,
      ],
      compute: async () => {
        const rawPokemon = await this.fetcher.fetchRawPokemon(normalized);
        const encounters = await this.fetcher.fetchRawEncounters(rawPokemon.id);
        return {
          pokemonId: rawPokemon.id,
          pokemonName: rawPokemon.name,
          encounters: mapRawEncounters(encounters),
        };
      },
    });

    return { cache: result.cache, ...result.data };
  }

  async getPokemonForms(
    rawIdOrName: string,
  ): Promise<CachedPokemonFormsResponse> {
    const normalized = this.normalizeIdentifier(rawIdOrName);
    const result = await this.httpCache.getCachedOrCompute({
      cacheKey: `pokeapi:v2:forms:${normalized}`,
      ttlSec: CACHE_TTL_24H_SEC,
      staleTtlSec: CACHE_STALE_TTL_7D_SEC,
      parse: (raw) =>
        CachedPokemonFormsResponseSchema.omit({ cache: true }).parse(raw),
      aliasKeys: (payload) => [
        `pokeapi:v2:forms:${payload.pokemonId}`,
        `pokeapi:v2:forms:${payload.pokemonName}`,
      ],
      compute: () => this.buildPokemonForms(normalized),
    });

    return { cache: result.cache, ...result.data };
  }

  private normalizeIdentifier(rawIdOrName: string): string {
    const parsed = PokemonIdentifierParamSchema.safeParse(rawIdOrName);
    if (!parsed.success) {
      throw new BadRequestException('Identificador de Pokémon inválido.');
    }
    return parsed.data;
  }

  private async buildPokemonBundle(normalized: string): Promise<PokemonBundle> {
    const [rawPokemon, directSpecies] = await Promise.all([
      this.fetcher.fetchRawPokemon(normalized),
      this.fetcher.tryFetchRawSpecies(normalized),
    ]);

    const speciesSlug = rawPokemon.species.name.toLowerCase();
    const rawSpecies =
      directSpecies && directSpecies.name.toLowerCase() === speciesSlug
        ? directSpecies
        : await this.fetcher.fetchRawSpecies(speciesSlug);

    const evolutionChainId = rawSpecies.evolution_chain?.url
      ? extractPokeApiId(rawSpecies.evolution_chain.url)
      : null;

    const [evolutionChain, typeRelations] = await Promise.all([
      this.fetchEvolutionChainIfPresent(evolutionChainId),
      this.fetchTypeRelations(rawPokemon),
    ]);

    return PokemonBundleSchema.parse({
      pokemon: mapRawPokemonToBundle(rawPokemon),
      species: mapRawSpeciesToBundle(rawSpecies),
      evolutionChain,
      typeEffectiveness: computeDefensiveTypeEffectiveness(typeRelations),
    });
  }

  private async buildPokemonForms(
    normalized: string,
  ): Promise<Omit<CachedPokemonFormsResponse, 'cache'>> {
    const rawPokemon = await this.fetcher.fetchRawPokemon(normalized);
    const rawSpecies = await this.fetcher.fetchRawSpecies(
      rawPokemon.species.name.toLowerCase(),
    );

    const candidateSlugs = new Set<string>();
    for (const form of rawPokemon.forms) {
      candidateSlugs.add(form.name.toLowerCase());
    }
    for (const variety of rawSpecies.varieties) {
      candidateSlugs.add(variety.pokemon.name.toLowerCase());
    }

    const slugs = Array.from(candidateSlugs).slice(0, MAX_FORMS_PER_POKEMON);
    const forms = await this.fetchFormsInBatches(slugs);

    forms.sort((a, b) => a.formOrder - b.formOrder || a.id - b.id);

    return {
      pokemonId: rawPokemon.id,
      pokemonName: rawPokemon.name,
      speciesName: rawSpecies.name,
      formsSwitchable: rawSpecies.forms_switchable,
      forms,
      varieties: mapSpeciesVarieties(rawSpecies.varieties),
    };
  }

  private async fetchFormsInBatches(
    slugs: readonly string[],
    offset = 0,
    acc: PokemonFormItem[] = [],
  ): Promise<PokemonFormItem[]> {
    if (offset >= slugs.length) {
      return acc;
    }
    const batch = slugs.slice(offset, offset + FORM_FETCH_BATCH_SIZE);
    const resolved = await Promise.all(
      batch.map((slug) => this.fetcher.tryFetchRawForm(slug)),
    );
    for (const item of resolved) {
      if (item) {
        acc.push(mapRawForm(item));
      }
    }
    return this.fetchFormsInBatches(slugs, offset + FORM_FETCH_BATCH_SIZE, acc);
  }

  private async fetchEvolutionChainIfPresent(
    evolutionChainId: number | null,
  ): Promise<EvolutionChainSummary | null> {
    if (evolutionChainId === null) {
      return null;
    }
    const raw = await this.fetcher.fetchRawEvolutionChain(evolutionChainId);
    return mapRawEvolutionChain(raw);
  }

  private async fetchTypeRelations(
    rawPokemon: RawPokeApiPokemon,
  ): Promise<TypeDamageRelationInput[]> {
    const typeNames = Array.from(
      new Set(rawPokemon.types.map((entry) => entry.type.name.toLowerCase())),
    );
    const rawTypes = await Promise.all(
      typeNames.map((typeName) => this.fetcher.fetchRawType(typeName)),
    );
    return rawTypes.map((rawType) => ({
      typeName: rawType.name,
      doubleDamageFrom: rawType.damage_relations.double_damage_from.map(
        (t) => t.name,
      ),
      halfDamageFrom: rawType.damage_relations.half_damage_from.map(
        (t) => t.name,
      ),
      noDamageFrom: rawType.damage_relations.no_damage_from.map((t) => t.name),
    }));
  }
}
