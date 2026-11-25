import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { formatPokeApiText } from '@pokeverse/shared';
import {
  CachedAbilityDetailResponseSchema,
  CachedBerryDetailResponseSchema,
  CachedEggGroupDetailResponseSchema,
  CachedEncyclopediaListResponseSchema,
  CachedGrowthRateDetailResponseSchema,
  CachedItemDetailResponseSchema,
  CachedLocationDetailResponseSchema,
  CachedMoveDetailResponseSchema,
  CachedNatureDetailResponseSchema,
  CachedNaturesListResponseSchema,
  CachedPokedexDetailResponseSchema,
  CachedRegionDetailResponseSchema,
  CachedTypeDetailResponseSchema,
  CachedTypesListResponseSchema,
  type EncyclopediaResourceKey,
} from '@pokeverse/shared/pokedex-encyclopedia';
import { Observable, catchError, map, of, timeout } from 'rxjs';
import {
  ENCYCLOPEDIA_CATEGORY_MAP,
  type EncyclopediaDetailPayload,
  type EncyclopediaListItemView,
  type EncyclopediaListView,
} from './encyclopedia-catalog.config';

const API_BASE = '/api/v1/pokedex/';
const REQUEST_TIMEOUT_MS = 10000;

type DetailParser = (raw: unknown) => EncyclopediaDetailPayload | null;

const DETAIL_PARSERS: Readonly<Record<EncyclopediaResourceKey, DetailParser>> = {
  move: (raw) => {
    const parsed = CachedMoveDetailResponseSchema.safeParse(raw);
    return parsed.success ? { kind: 'move', data: parsed.data.move } : null;
  },
  ability: (raw) => {
    const parsed = CachedAbilityDetailResponseSchema.safeParse(raw);
    return parsed.success ? { kind: 'ability', data: parsed.data.ability } : null;
  },
  item: (raw) => {
    const parsed = CachedItemDetailResponseSchema.safeParse(raw);
    return parsed.success ? { kind: 'item', data: parsed.data.item } : null;
  },
  berry: (raw) => {
    const parsed = CachedBerryDetailResponseSchema.safeParse(raw);
    return parsed.success ? { kind: 'berry', data: parsed.data.berry } : null;
  },
  region: (raw) => {
    const parsed = CachedRegionDetailResponseSchema.safeParse(raw);
    return parsed.success ? { kind: 'region', data: parsed.data.region } : null;
  },
  pokedex: (raw) => {
    const parsed = CachedPokedexDetailResponseSchema.safeParse(raw);
    return parsed.success ? { kind: 'pokedex', data: parsed.data.pokedex } : null;
  },
  location: (raw) => {
    const parsed = CachedLocationDetailResponseSchema.safeParse(raw);
    return parsed.success ? { kind: 'location', data: parsed.data.location } : null;
  },
  'egg-group': (raw) => {
    const parsed = CachedEggGroupDetailResponseSchema.safeParse(raw);
    return parsed.success ? { kind: 'egg-group', data: parsed.data.eggGroup } : null;
  },
  'growth-rate': (raw) => {
    const parsed = CachedGrowthRateDetailResponseSchema.safeParse(raw);
    return parsed.success ? { kind: 'growth-rate', data: parsed.data.growthRate } : null;
  },
  nature: (raw) => {
    const parsed = CachedNatureDetailResponseSchema.safeParse(raw);
    return parsed.success ? { kind: 'nature', data: parsed.data.nature } : null;
  },
  type: (raw) => {
    const parsed = CachedTypeDetailResponseSchema.safeParse(raw);
    return parsed.success ? { kind: 'type', data: parsed.data.type } : null;
  },
};

function paginateFullList(
  resource: EncyclopediaResourceKey,
  entries: readonly EncyclopediaListItemView[],
  query: string,
  limit: number,
  offset: number,
): EncyclopediaListView {
  const term = query.trim().toLowerCase();
  const filtered = term
    ? entries.filter(
        (item) => item.name.includes(term) || item.displayName.toLowerCase().includes(term),
      )
    : entries;
  const items = filtered.slice(offset, offset + limit);
  return {
    resource,
    total: filtered.length,
    limit,
    offset,
    hasMore: offset + items.length < filtered.length,
    items,
  };
}

@Injectable({ providedIn: 'root' })
export class EncyclopediaApiClient {
  private readonly http = inject(HttpClient);

  fetchList(
    category: EncyclopediaResourceKey,
    params: { readonly limit: number; readonly offset: number; readonly q: string },
  ): Observable<EncyclopediaListView | null> {
    if (category === 'nature') {
      return this.fetchNaturesList(params);
    }
    if (category === 'type') {
      return this.fetchTypesList(params);
    }
    const spec = ENCYCLOPEDIA_CATEGORY_MAP[category];
    const queryStr = new URLSearchParams({
      limit: String(params.limit),
      offset: String(params.offset),
      q: params.q.trim(),
    }).toString();

    return this.http.get<unknown>(`${API_BASE}${spec.endpointPath}?${queryStr}`).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((raw): EncyclopediaListView | null => {
        const parsed = CachedEncyclopediaListResponseSchema.safeParse(raw);
        if (!parsed.success) return null;
        return {
          resource: parsed.data.resource,
          total: parsed.data.total,
          limit: parsed.data.limit,
          offset: parsed.data.offset,
          hasMore: parsed.data.hasMore,
          items: parsed.data.items.map((item) => ({
            id: item.id,
            name: item.name,
            displayName: formatPokeApiText(item.name),
            subtitle: null,
          })),
        };
      }),
      catchError(() => of(null)),
    );
  }

  fetchDetail(
    category: EncyclopediaResourceKey,
    idOrName: string,
  ): Observable<EncyclopediaDetailPayload | null> {
    const spec = ENCYCLOPEDIA_CATEGORY_MAP[category];
    const parser = DETAIL_PARSERS[category];
    return this.http
      .get<unknown>(`${API_BASE}${spec.endpointPath}/${encodeURIComponent(idOrName)}`)
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((raw) => parser(raw)),
        catchError(() => of(null)),
      );
  }

  private fetchNaturesList(params: {
    readonly limit: number;
    readonly offset: number;
    readonly q: string;
  }): Observable<EncyclopediaListView | null> {
    return this.http.get<unknown>(`${API_BASE}natures`).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((raw) => {
        const parsed = CachedNaturesListResponseSchema.safeParse(raw);
        if (!parsed.success) return null;
        const mapped = parsed.data.natures.map((n) => ({
          id: n.id,
          name: n.name,
          displayName: formatPokeApiText(n.name),
          subtitle: n.isNeutral
            ? 'Neutra'
            : `+${formatPokeApiText(n.increasedStat)} / -${formatPokeApiText(n.decreasedStat)}`,
        }));
        return paginateFullList('nature', mapped, params.q, params.limit, params.offset);
      }),
      catchError(() => of(null)),
    );
  }

  private fetchTypesList(params: {
    readonly limit: number;
    readonly offset: number;
    readonly q: string;
  }): Observable<EncyclopediaListView | null> {
    return this.http.get<unknown>(`${API_BASE}types`).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((raw) => {
        const parsed = CachedTypesListResponseSchema.safeParse(raw);
        if (!parsed.success) return null;
        const mapped = parsed.data.types.map((t) => ({
          id: t.id,
          name: t.name,
          displayName: formatPokeApiText(t.name),
          subtitle: `${t.pokemonCount} Pokémon · ${t.moveCount} golpes`,
        }));
        return paginateFullList('type', mapped, params.q, params.limit, params.offset);
      }),
      catchError(() => of(null)),
    );
  }
}
