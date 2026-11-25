import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  type CachedPokemonEncountersResponse,
  CachedPokemonEncountersResponseSchema,
  type CachedPokemonFormsResponse,
  CachedPokemonFormsResponseSchema,
  CachedCatalogResponseSchema,
  CachedPokemonBundleResponseSchema,
  CachedPokemonResponseSchema,
  type PokeApiCatalogResponse,
  PokeApiCatalogResponseSchema,
  PokemonDetailSchema,
} from '@pokeverse/shared';
import {
  type AbilityDetail,
  CachedAbilityDetailResponseSchema,
  CachedMoveDetailResponseSchema,
  type MoveDetail,
} from '@pokeverse/shared/pokedex-encyclopedia';
import { Observable, catchError, map, of, timeout } from 'rxjs';
import type { ResolvedPokemonResult } from './pokedex-view-mapper.util';

const API_CATALOG_URL = '/api/v1/pokedex/catalog';
const API_POKEMON_BASE = '/api/v1/pokedex/pokemon/';
const API_MOVES_BASE = '/api/v1/pokedex/moves/';
const API_ABILITIES_BASE = '/api/v1/pokedex/abilities/';
const POKEAPI_CATALOG_URL = 'https://pokeapi.co/api/v2/pokemon?limit=100000&offset=0';
const POKEAPI_DETAIL_BASE = 'https://pokeapi.co/api/v2/pokemon/';
const REQUEST_TIMEOUT_MS = 10000;

@Injectable({ providedIn: 'root' })
export class PokedexApiClient {
  private readonly http = inject(HttpClient);

  fetchCatalog(): Observable<PokeApiCatalogResponse | null> {
    return this.http.get<unknown>(API_CATALOG_URL).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((raw) => {
        const cached = CachedCatalogResponseSchema.safeParse(raw);
        return cached.success ? cached.data.catalog : null;
      }),
      catchError(() =>
        this.http.get<unknown>(POKEAPI_CATALOG_URL).pipe(
          timeout(REQUEST_TIMEOUT_MS),
          map((directRaw) => {
            const direct = PokeApiCatalogResponseSchema.safeParse(directRaw);
            return direct.success ? direct.data : null;
          }),
          catchError(() => of(null)),
        ),
      ),
    );
  }

  fetchPokemonBundle(normalized: string): Observable<ResolvedPokemonResult> {
    return this.http
      .get<unknown>(`${API_POKEMON_BASE}${encodeURIComponent(normalized)}/bundle`)
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((raw): ResolvedPokemonResult | null => {
          const parsed = CachedPokemonBundleResponseSchema.safeParse(raw);
          if (!parsed.success) return null;
          return {
            found: true,
            dto: null,
            bundle: parsed.data.bundle,
            source: parsed.data.cache,
          };
        }),
        catchError((err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === 404) {
            return of<ResolvedPokemonResult>({ found: false, notFound: true, statusCode: 404 });
          }
          return this.fetchPokemonDto(normalized);
        }),
        map((res) => res ?? { found: false, notFound: false, statusCode: null }),
      );
  }

  fetchPokemonDto(normalized: string): Observable<ResolvedPokemonResult> {
    return this.http.get<unknown>(`${API_POKEMON_BASE}${encodeURIComponent(normalized)}`).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((raw): ResolvedPokemonResult => {
        const parsed = CachedPokemonResponseSchema.safeParse(raw);
        if (!parsed.success) {
          return { found: false, notFound: false, statusCode: null };
        }
        return {
          found: true,
          dto: parsed.data.pokemon,
          bundle: null,
          source: parsed.data.cache,
        };
      }),
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 404) {
          return of<ResolvedPokemonResult>({ found: false, notFound: true, statusCode: 404 });
        }
        return this.fetchDirectPokemonDto(normalized);
      }),
    );
  }

  fetchPokemonEncounters(normalized: string): Observable<CachedPokemonEncountersResponse | null> {
    return this.http
      .get<unknown>(`${API_POKEMON_BASE}${encodeURIComponent(normalized)}/encounters`)
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((raw) => {
          const parsed = CachedPokemonEncountersResponseSchema.safeParse(raw);
          return parsed.success ? parsed.data : null;
        }),
        catchError(() => of(null)),
      );
  }

  fetchPokemonForms(normalized: string): Observable<CachedPokemonFormsResponse | null> {
    return this.http
      .get<unknown>(`${API_POKEMON_BASE}${encodeURIComponent(normalized)}/forms`)
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((raw) => {
          const parsed = CachedPokemonFormsResponseSchema.safeParse(raw);
          return parsed.success ? parsed.data : null;
        }),
        catchError(() => of(null)),
      );
  }

  fetchMoveDetail(moveName: string): Observable<MoveDetail | null> {
    return this.http.get<unknown>(`${API_MOVES_BASE}${encodeURIComponent(moveName)}`).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((raw) => {
        const parsed = CachedMoveDetailResponseSchema.safeParse(raw);
        return parsed.success ? parsed.data.move : null;
      }),
      catchError(() => of(null)),
    );
  }

  fetchAbilityDetail(abilityName: string): Observable<AbilityDetail | null> {
    return this.http.get<unknown>(`${API_ABILITIES_BASE}${encodeURIComponent(abilityName)}`).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((raw) => {
        const parsed = CachedAbilityDetailResponseSchema.safeParse(raw);
        return parsed.success ? parsed.data.ability : null;
      }),
      catchError(() => of(null)),
    );
  }

  private fetchDirectPokemonDto(normalized: string): Observable<ResolvedPokemonResult> {
    return this.http.get<unknown>(`${POKEAPI_DETAIL_BASE}${encodeURIComponent(normalized)}`).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((raw): ResolvedPokemonResult => {
        const parsed = PokemonDetailSchema.safeParse(raw);
        return parsed.success
          ? { found: true, dto: parsed.data, bundle: null, source: 'direct' }
          : { found: false, notFound: false, statusCode: null };
      }),
      catchError((directErr: unknown) => {
        const status = directErr instanceof HttpErrorResponse ? directErr.status || null : null;
        return of<ResolvedPokemonResult>({
          found: false,
          notFound: status === 404,
          statusCode: status,
        });
      }),
    );
  }
}
