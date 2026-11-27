import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { normalizePokemonName } from '@pokeverse/shared';
import {
  type CachedEggGroupDetailResponse,
  CachedEggGroupDetailResponseSchema,
  CachedMoveDetailResponseSchema,
  CachedAbilityDetailResponseSchema,
  type CachedPokedexDetailResponse,
  CachedPokedexDetailResponseSchema,
  type EggGroupDetail,
  type PokedexDetail,
} from '@pokeverse/shared/pokedex-encyclopedia';
import { Observable, catchError, forkJoin, map, of, timeout } from 'rxjs';
import { GAME_FILTER_OPTIONS } from './pokedex-attribute-search.util';

export type AttributeLookupKind = 'move' | 'ability' | 'pokedex' | 'eggGroup';

export interface AttributeLookupRequest {
  readonly kind: AttributeLookupKind;
  readonly slug: string;
}

export function buildAttributeLookupRequests(params: {
  readonly moveFilter: string | null;
  readonly abilityFilter: string | null;
  readonly game: string | null;
  readonly eggGroup: string | null;
  readonly hasEnrichedEggGroups: boolean;
}): AttributeLookupRequest[] {
  const requests: AttributeLookupRequest[] = [];
  if (params.moveFilter) requests.push({ kind: 'move', slug: params.moveFilter });
  if (params.abilityFilter) requests.push({ kind: 'ability', slug: params.abilityFilter });
  const gameMeta = params.game
    ? GAME_FILTER_OPTIONS.find((item) => item.id === params.game)
    : undefined;
  if (gameMeta) requests.push({ kind: 'pokedex', slug: gameMeta.pokedexSlug });
  if (params.eggGroup && !params.hasEnrichedEggGroups) {
    requests.push({ kind: 'eggGroup', slug: params.eggGroup });
  }
  return requests;
}

const API_MOVES_BASE = '/api/v1/pokedex/moves/';
const API_ABILITIES_BASE = '/api/v1/pokedex/abilities/';
const API_EGG_GROUPS_BASE = '/api/v1/pokedex/egg-groups/';
const API_POKEDEXES_BASE = '/api/v1/pokedex/pokedexes/';
const POKEAPI_V2_BASE = 'https://pokeapi.co/api/v2';
const REQUEST_TIMEOUT_MS = 10000;

interface RawNamedListEntry {
  readonly name?: string;
}

interface RawPokemonSlotEntry {
  readonly pokemon?: RawNamedListEntry;
}

interface RawPokedexEntry {
  readonly pokemon_species?: RawNamedListEntry;
}

function extractDirectNames(entries: readonly RawNamedListEntry[] | undefined): readonly string[] {
  if (!entries?.length) return [];
  return entries.map((entry) => entry.name?.trim().toLowerCase() ?? '').filter(Boolean);
}

@Injectable({ providedIn: 'root' })
export class PokedexAttributeLookupService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, ReadonlySet<string>>();

  resolveIntersection(
    requests: readonly AttributeLookupRequest[],
  ): Observable<ReadonlySet<string> | null> {
    if (requests.length === 0) return of(null);
    return forkJoin(requests.map((req) => this.resolveSingle(req.kind, req.slug))).pipe(
      map((sets) => intersectSets(sets)),
    );
  }

  private resolveSingle(
    kind: AttributeLookupKind,
    rawSlug: string,
  ): Observable<ReadonlySet<string> | null> {
    const slug = normalizePokemonName(rawSlug);
    if (!slug) return of(null);

    const cacheKey = `${kind}:${slug}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return of(cached);

    return this.fetchNamesByKind(kind, slug).pipe(
      map((names) => {
        if (!names) return null;
        const set = new Set(names);
        this.cache.set(cacheKey, set);
        return set;
      }),
    );
  }

  private fetchNamesByKind(
    kind: AttributeLookupKind,
    slug: string,
  ): Observable<readonly string[] | null> {
    if (kind === 'move') return this.fetchMoveSpeciesNames(slug);
    if (kind === 'ability') return this.fetchAbilitySpeciesNames(slug);
    if (kind === 'pokedex') return this.fetchPokedexSpeciesNames(slug);
    return this.fetchEggGroupSpeciesNames(slug);
  }

  private fetchMoveSpeciesNames(moveName: string): Observable<readonly string[] | null> {
    return this.http.get<unknown>(`${API_MOVES_BASE}${encodeURIComponent(moveName)}`).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((raw) => {
        const parsed = CachedMoveDetailResponseSchema.safeParse(raw);
        return parsed.success
          ? parsed.data.move.learnedByPokemon.map((item) => item.pokemonName.toLowerCase())
          : null;
      }),
      catchError(() =>
        this.http
          .get<{ readonly learned_by_pokemon?: readonly RawNamedListEntry[] }>(
            `${POKEAPI_V2_BASE}/move/${encodeURIComponent(moveName)}`,
          )
          .pipe(
            timeout(REQUEST_TIMEOUT_MS),
            map((raw) => extractDirectNames(raw.learned_by_pokemon)),
            catchError(() => of(null)),
          ),
      ),
    );
  }

  private fetchAbilitySpeciesNames(abilityName: string): Observable<readonly string[] | null> {
    return this.http.get<unknown>(`${API_ABILITIES_BASE}${encodeURIComponent(abilityName)}`).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((raw) => {
        const parsed = CachedAbilityDetailResponseSchema.safeParse(raw);
        return parsed.success
          ? parsed.data.ability.pokemon.map((item) => item.pokemonName.toLowerCase())
          : null;
      }),
      catchError(() =>
        this.http
          .get<{ readonly pokemon?: readonly RawPokemonSlotEntry[] }>(
            `${POKEAPI_V2_BASE}/ability/${encodeURIComponent(abilityName)}`,
          )
          .pipe(
            timeout(REQUEST_TIMEOUT_MS),
            map((raw) => extractDirectNames(raw.pokemon?.map((entry) => entry.pokemon ?? {}))),
            catchError(() => of(null)),
          ),
      ),
    );
  }

  private fetchEggGroupSpeciesNames(eggGroupName: string): Observable<readonly string[] | null> {
    return this.http.get<unknown>(`${API_EGG_GROUPS_BASE}${encodeURIComponent(eggGroupName)}`).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((raw) => {
        const parsed: { readonly success: boolean; readonly data?: CachedEggGroupDetailResponse } =
          CachedEggGroupDetailResponseSchema.safeParse(raw);
        const detail: EggGroupDetail | undefined = parsed.success
          ? parsed.data?.eggGroup
          : undefined;
        return detail ? detail.pokemonSpecies.map((item) => item.pokemonName.toLowerCase()) : null;
      }),
      catchError(() =>
        this.http
          .get<{ readonly pokemon_species?: readonly RawNamedListEntry[] }>(
            `${POKEAPI_V2_BASE}/egg-group/${encodeURIComponent(eggGroupName)}`,
          )
          .pipe(
            timeout(REQUEST_TIMEOUT_MS),
            map((raw) => extractDirectNames(raw.pokemon_species)),
            catchError(() => of(null)),
          ),
      ),
    );
  }

  private fetchPokedexSpeciesNames(pokedexSlug: string): Observable<readonly string[] | null> {
    return this.http.get<unknown>(`${API_POKEDEXES_BASE}${encodeURIComponent(pokedexSlug)}`).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((raw) => {
        const parsed: { readonly success: boolean; readonly data?: CachedPokedexDetailResponse } =
          CachedPokedexDetailResponseSchema.safeParse(raw);
        const detail: PokedexDetail | undefined = parsed.success ? parsed.data?.pokedex : undefined;
        return detail ? detail.entries.map((item) => item.speciesName.toLowerCase()) : null;
      }),
      catchError(() =>
        this.http
          .get<{ readonly pokemon_entries?: readonly RawPokedexEntry[] }>(
            `${POKEAPI_V2_BASE}/pokedex/${encodeURIComponent(pokedexSlug)}`,
          )
          .pipe(
            timeout(REQUEST_TIMEOUT_MS),
            map((raw) =>
              extractDirectNames(raw.pokemon_entries?.map((entry) => entry.pokemon_species ?? {})),
            ),
            catchError(() => of(null)),
          ),
      ),
    );
  }
}

function intersectSets(sets: readonly (ReadonlySet<string> | null)[]): ReadonlySet<string> | null {
  if (sets.some((set) => set === null)) return null;
  const nonNull = sets.filter((set): set is ReadonlySet<string> => set !== null);
  const first = nonNull[0];
  if (!first) return null;
  if (nonNull.length === 1) return first;

  const result = new Set<string>();
  for (const name of first) {
    if (nonNull.every((other) => other.has(name))) {
      result.add(name);
    }
  }
  return result;
}
