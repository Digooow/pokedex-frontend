import { describe, expect, it } from 'vitest';
import {
  type EnrichedCatalogItem,
  POKEAPI_V2_ENDPOINTS,
  filterCatalogWithAdvancedQuery,
} from './pokeapi-endpoints';
import { buildPhoneticKey, cleanComparisonText } from './pokedex-search';

function createCatalogItem(
  item: Omit<EnrichedCatalogItem, 'compactName' | 'phoneticName'>,
): EnrichedCatalogItem {
  return {
    ...item,
    compactName: cleanComparisonText(item.name),
    phoneticName: buildPhoneticKey(item.name),
  };
}

const SAMPLE_CATALOG: readonly EnrichedCatalogItem[] = [
  createCatalogItem({
    id: 25,
    name: 'pikachu',
    displayName: 'Pikachu',
    types: ['electric'],
    generation: 1,
    habitat: 'forest',
    isLegendary: false,
    isMythical: false,
    isBaby: false,
    baseStatTotal: 320,
  }),
  createCatalogItem({
    id: 172,
    name: 'pichu',
    displayName: 'Pichu',
    types: ['electric'],
    generation: 2,
    habitat: 'forest',
    isLegendary: false,
    isMythical: false,
    isBaby: true,
    baseStatTotal: 205,
  }),
  createCatalogItem({
    id: 150,
    name: 'mewtwo',
    displayName: 'Mewtwo',
    types: ['psychic'],
    generation: 1,
    habitat: 'rare',
    isLegendary: true,
    isMythical: false,
    isBaby: false,
    baseStatTotal: 680,
  }),
  createCatalogItem({
    id: 151,
    name: 'mew',
    displayName: 'Mew',
    types: ['psychic'],
    generation: 1,
    habitat: 'rare',
    isLegendary: false,
    isMythical: true,
    isBaby: false,
    baseStatTotal: 600,
  }),
  createCatalogItem({
    id: 6,
    name: 'charizard',
    displayName: 'Charizard',
    types: ['fire', 'flying'],
    generation: 1,
    habitat: 'mountain',
    isLegendary: false,
    isMythical: false,
    isBaby: false,
    baseStatTotal: 534,
  }),
];

describe('pokeapi-endpoints domain catalog and advanced query', () => {
  it('registers all 51 PokeAPI v2 resource specs with unique keys and valid templates', () => {
    expect(POKEAPI_V2_ENDPOINTS).toHaveLength(51);
    const keys = new Set(POKEAPI_V2_ENDPOINTS.map((entry) => entry.key));
    expect(keys.size).toBe(51);
    for (const entry of POKEAPI_V2_ENDPOINTS) {
      expect(entry.pathTemplate.startsWith('/')).toBe(true);
      expect(entry.targetFeature.length).toBeGreaterThan(3);
    }
    expect(
      POKEAPI_V2_ENDPOINTS.filter((entry) => entry.implementedInBff).map((e) => e.key),
    ).toEqual([
      'ability',
      'berry',
      'egg-group',
      'evolution-chain',
      'generation',
      'growth-rate',
      'item',
      'location',
      'move',
      'nature',
      'pokedex',
      'pokemon',
      'pokemon-color',
      'pokemon-form',
      'pokemon-habitat',
      'pokemon-shape',
      'pokemon-species',
      'region',
      'type',
      'pokemon-encounters',
      'pokemon-cries',
      'pokemon-sprites-matrix',
    ]);
  });

  it('filters by types, generation, habitat, color, shape, species flags, minBst, and fuzzy term', () => {
    const dualType = filterCatalogWithAdvancedQuery(SAMPLE_CATALOG, {
      types: ['fire', 'flying'],
      generation: 1,
      habitat: 'MOUNTAIN',
      minBst: 500,
    });
    expect(dualType.map((entry) => entry.name)).toEqual(['charizard']);

    const megaCatalog: readonly EnrichedCatalogItem[] = [
      ...SAMPLE_CATALOG.map((item) => ({
        ...item,
        isDefault: true,
        color: item.name === 'charizard' ? 'red' : 'yellow',
        shape: item.name === 'charizard' ? 'upright' : 'quadruped',
      })),
      createCatalogItem({
        id: 10034,
        name: 'charizard-mega-x',
        displayName: 'Charizard Mega X',
        isDefault: false,
        types: ['fire', 'dragon'],
        generation: 1,
        habitat: 'mountain',
        color: 'black',
        shape: 'upright',
        isLegendary: false,
        isMythical: false,
        isBaby: false,
        baseStatTotal: 634,
      }),
    ];

    expect(
      filterCatalogWithAdvancedQuery(megaCatalog, {
        color: 'RED',
        shape: 'Upright',
        excludeAlternateForms: true,
      }).map((entry) => entry.name),
    ).toEqual(['charizard']);

    expect(
      filterCatalogWithAdvancedQuery(megaCatalog, {
        term: 'charizard',
        excludeAlternateForms: false,
      }).map((entry) => entry.name),
    ).toEqual(['charizard', 'charizard-mega-x']);

    const legendary = filterCatalogWithAdvancedQuery(SAMPLE_CATALOG, {
      onlyLegendary: true,
    });
    expect(legendary.map((entry) => entry.name)).toEqual(['mewtwo']);

    const mythical = filterCatalogWithAdvancedQuery(SAMPLE_CATALOG, {
      onlyMythical: true,
    });
    expect(mythical.map((entry) => entry.name)).toEqual(['mew']);

    const baby = filterCatalogWithAdvancedQuery(SAMPLE_CATALOG, {
      onlyBaby: true,
      generation: 2,
    });
    expect(baby.map((entry) => entry.name)).toEqual(['pichu']);

    const fuzzyWithMinBst = filterCatalogWithAdvancedQuery(SAMPLE_CATALOG, {
      term: 'mew',
      minBst: 650,
    });
    expect(fuzzyWithMinBst.map((entry) => entry.name)).toEqual(['mewtwo']);
  });

  it('applies pagination limits, sorting orders, and rejects out-of-range query bounds', () => {
    expect(
      filterCatalogWithAdvancedQuery(SAMPLE_CATALOG, { sortBy: 'id-asc', limit: 2 }).map(
        (entry) => entry.id,
      ),
    ).toEqual([6, 25]);

    expect(
      filterCatalogWithAdvancedQuery(SAMPLE_CATALOG, { sortBy: 'id-desc', limit: 2 }).map(
        (entry) => entry.id,
      ),
    ).toEqual([172, 151]);

    expect(
      filterCatalogWithAdvancedQuery(SAMPLE_CATALOG, { sortBy: 'name-asc', limit: 3 }).map(
        (entry) => entry.name,
      ),
    ).toEqual(['charizard', 'mew', 'mewtwo']);

    expect(
      filterCatalogWithAdvancedQuery(SAMPLE_CATALOG, { sortBy: 'bst-desc', limit: 3 }).map(
        (entry) => entry.name,
      ),
    ).toEqual(['mewtwo', 'mew', 'charizard']);

    expect(filterCatalogWithAdvancedQuery([], { sortBy: 'bst-desc' })).toEqual([]);
    expect(() => filterCatalogWithAdvancedQuery(SAMPLE_CATALOG, { limit: 0 })).toThrow();
    expect(() => filterCatalogWithAdvancedQuery(SAMPLE_CATALOG, { generation: 10 })).toThrow();
  });

  it('filters by region and eggGroup (raça) accurately', () => {
    const withEggGroups: readonly EnrichedCatalogItem[] = SAMPLE_CATALOG.map((item) => ({
      ...item,
      eggGroups: item.name === 'charizard' ? ['monster', 'dragon'] : ['field'],
    }));

    expect(
      filterCatalogWithAdvancedQuery(withEggGroups, { region: 'kanto', eggGroup: 'Dragon' }).map(
        (entry) => entry.name,
      ),
    ).toEqual(['charizard']);

    expect(
      filterCatalogWithAdvancedQuery(withEggGroups, { region: 'johto' }).map((entry) => entry.name),
    ).toEqual(['pichu']);

    expect(filterCatalogWithAdvancedQuery(withEggGroups, { region: 'unknown-region' })).toEqual([]);
  });
});
