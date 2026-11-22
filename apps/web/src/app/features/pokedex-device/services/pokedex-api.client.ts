import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CachedCatalogResponseSchema,
  CachedPokemonResponseSchema,
  type PokeApiCatalogResponse,
  PokeApiCatalogResponseSchema,
  PokemonDetailSchema,
} from '@pokeverse/shared';
import { Observable, catchError, map, of, timeout } from 'rxjs';
import type { ResolvedPokemonResult } from './pokedex-view-mapper.util';

const API_CATALOG_URL = '/api/v1/pokedex/catalog';
const API_POKEMON_BASE = '/api/v1/pokedex/pokemon/';
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
          source: parsed.data.cache === 'hit' ? 'hit' : 'miss',
        };
      }),
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 404) {
          return of<ResolvedPokemonResult>({ found: false, notFound: true, statusCode: 404 });
        }
        return this.http
          .get<unknown>(`${POKEAPI_DETAIL_BASE}${encodeURIComponent(normalized)}`)
          .pipe(
            timeout(REQUEST_TIMEOUT_MS),
            map((raw): ResolvedPokemonResult => {
              const parsed = PokemonDetailSchema.safeParse(raw);
              return parsed.success
                ? { found: true, dto: parsed.data, source: 'direct' }
                : { found: false, notFound: false, statusCode: null };
            }),
            catchError((directErr: unknown) => {
              const status =
                directErr instanceof HttpErrorResponse ? directErr.status || null : null;
              return of<ResolvedPokemonResult>({
                found: false,
                notFound: status === 404,
                statusCode: status,
              });
            }),
          );
      }),
    );
  }
}
