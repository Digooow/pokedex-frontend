import { describe, expect, it } from 'vitest';
import { filterCatalogWithAdvancedQuery } from '../domain/pokeapi-endpoints';
import {
  CachedEnrichedCatalogResponseSchema,
  CachedPokedexMetaFiltersResponseSchema,
  hydrateEnrichedCatalog,
} from './pokedex-catalog.schemas';

describe('pokedex-catalog.schemas', () => {
  it('validates enriched catalog responses for graphql and rest-fallback sources', () => {
    const graphqlResponse = CachedEnrichedCatalogResponseSchema.parse({
      cache: 'miss',
      source: 'graphql',
      degraded: false,
      count: 2,
      items: [
        {
          id: 25,
          name: 'pikachu',
          isDefault: true,
          types: ['electric'],
          generation: 1,
          habitat: 'forest',
          color: 'yellow',
          shape: 'quadruped',
          isLegendary: false,
          isMythical: false,
          isBaby: false,
          baseStatTotal: 320,
        },
        {
          id: 10080,
          name: 'pikachu-rock-star',
          isDefault: false,
          types: ['electric'],
          generation: 1,
          habitat: 'forest',
          color: 'yellow',
          shape: 'quadruped',
          isLegendary: false,
          isMythical: false,
          isBaby: false,
          baseStatTotal: 320,
        },
      ],
    });

    expect(graphqlResponse.items).toHaveLength(2);

    const restFallbackResponse = CachedEnrichedCatalogResponseSchema.parse({
      cache: 'hit',
      source: 'rest-fallback',
      degraded: true,
      count: 1,
      items: [
        {
          id: 1,
          name: 'bulbasaur',
          isDefault: true,
          types: [],
          generation: null,
          habitat: null,
          color: null,
          shape: null,
          isLegendary: false,
          isMythical: false,
          isBaby: false,
          baseStatTotal: 0,
        },
      ],
    });

    expect(restFallbackResponse.degraded).toBe(true);
    expect(() =>
      CachedEnrichedCatalogResponseSchema.parse({
        ...graphqlResponse,
        items: [{ ...graphqlResponse.items[0], generation: 10 }],
      }),
    ).toThrow();
    expect(() =>
      CachedEnrichedCatalogResponseSchema.parse({
        ...graphqlResponse,
        items: [{ ...graphqlResponse.items[0], types: ['invalid-type'] }],
      }),
    ).toThrow();
  });

  it('validates meta filters response and hydrates enriched catalog for advanced search', () => {
    const meta = CachedPokedexMetaFiltersResponseSchema.parse({
      cache: 'hit',
      filters: {
        types: [{ id: 13, name: 'electric' }],
        generations: [{ id: 1, name: 'generation-i', regionName: 'kanto' }],
        habitats: [{ id: 2, name: 'forest' }],
        colors: [{ id: 10, name: 'yellow' }],
        shapes: [{ id: 8, name: 'quadruped' }],
        eggGroups: [{ id: 5, name: 'ground' }],
        growthRates: [{ id: 2, name: 'medium' }],
        regions: [{ id: 1, name: 'kanto' }],
      },
    });
    expect(meta.filters.generations[0]?.regionName).toBe('kanto');

    const hydrated = hydrateEnrichedCatalog([
      {
        id: 25,
        name: 'pikachu',
        isDefault: true,
        types: ['electric'],
        generation: 1,
        habitat: 'forest',
        color: 'yellow',
        shape: 'quadruped',
        isLegendary: false,
        isMythical: false,
        isBaby: false,
        baseStatTotal: 320,
      },
      {
        id: 10080,
        name: 'pikachu-rock-star',
        isDefault: false,
        types: ['electric'],
        generation: 1,
        habitat: 'forest',
        color: 'yellow',
        shape: 'quadruped',
        isLegendary: false,
        isMythical: false,
        isBaby: false,
        baseStatTotal: 320,
      },
    ]);

    const filtered = filterCatalogWithAdvancedQuery(hydrated, {
      term: 'picaxu',
      types: ['electric'],
      generation: 1,
      color: 'yellow',
      shape: 'quadruped',
      excludeAlternateForms: true,
    });
    expect(filtered.map((item) => item.name)).toEqual(['pikachu']);
  });
});
