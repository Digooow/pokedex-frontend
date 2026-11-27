import { buildSearchableCatalogItem, type EnrichedCatalogItem } from '@pokeverse/shared';
import { createCachedPokemonBundleFixture } from '../../../testing/test-fixtures.spec-helper';
import { mapPokemonBundleToView } from './pokedex-view-mapper.util';
import {
  MIN_VISIBLE_CATALOG_ITEMS,
  buildCatalogDisplayList,
} from './pokedex-catalog-companions.util';

const SAMPLE_FULL_CATALOG = [
  buildSearchableCatalogItem(1, 'bulbasaur'),
  buildSearchableCatalogItem(2, 'ivysaur'),
  buildSearchableCatalogItem(3, 'venusaur'),
  buildSearchableCatalogItem(4, 'charmander'),
  buildSearchableCatalogItem(7, 'squirtle'),
  buildSearchableCatalogItem(10, 'caterpie'),
  buildSearchableCatalogItem(16, 'pidgey'),
  buildSearchableCatalogItem(25, 'pikachu'),
  buildSearchableCatalogItem(26, 'raichu'),
  buildSearchableCatalogItem(43, 'oddish'),
];

const SAMPLE_ENRICHED: readonly EnrichedCatalogItem[] = [
  { ...SAMPLE_FULL_CATALOG[0]!, types: ['grass', 'poison'], generation: 1 },
  { ...SAMPLE_FULL_CATALOG[1]!, types: ['grass', 'poison'], generation: 1 },
  { ...SAMPLE_FULL_CATALOG[2]!, types: ['grass', 'poison'], generation: 1 },
  { ...SAMPLE_FULL_CATALOG[3]!, types: ['fire'], generation: 1 },
  { ...SAMPLE_FULL_CATALOG[4]!, types: ['water'], generation: 1 },
  { ...SAMPLE_FULL_CATALOG[7]!, types: ['electric'], generation: 1 },
  { ...SAMPLE_FULL_CATALOG[8]!, types: ['electric'], generation: 1 },
  { ...SAMPLE_FULL_CATALOG[9]!, types: ['grass', 'poison'], generation: 1 },
];

describe('pokedex-catalog-companions.util', () => {
  it('returns empty display list when there are no primary matches', () => {
    const res = buildCatalogDisplayList({
      primaryItems: [],
      fullCatalog: SAMPLE_FULL_CATALOG,
      enrichedCatalog: SAMPLE_ENRICHED,
      selectedPokemon: null,
    });
    expect(res).toEqual({ primaryCount: 0, companionCount: 0, items: [] });
  });

  it('fills a single match (e.g. ivysaur) with evolution, same-type, and nearest ID companions', () => {
    const ivysaur = { ...SAMPLE_FULL_CATALOG[1]!, score: 0, approximate: false };
    const selectedBundle = createCachedPokemonBundleFixture({
      id: 2,
      name: 'ivysaur',
      typeName: 'grass',
    });
    selectedBundle.bundle.evolutionChain = {
      id: 1,
      babyTriggerItem: null,
      root: {
        speciesId: 1,
        speciesName: 'bulbasaur',
        isBaby: false,
        evolutionDetails: [],
        evolvesTo: [
          {
            speciesId: 2,
            speciesName: 'ivysaur',
            isBaby: false,
            evolutionDetails: [],
            evolvesTo: [
              {
                speciesId: 3,
                speciesName: 'venusaur',
                isBaby: false,
                evolutionDetails: [],
                evolvesTo: [],
              },
            ],
          },
        ],
      },
    };

    const res = buildCatalogDisplayList({
      primaryItems: [ivysaur],
      fullCatalog: SAMPLE_FULL_CATALOG,
      enrichedCatalog: SAMPLE_ENRICHED,
      selectedPokemon: mapPokemonBundleToView(selectedBundle.bundle),
    });

    expect(res.primaryCount).toBe(1);
    expect(res.companionCount).toBe(MIN_VISIBLE_CATALOG_ITEMS - 1);
    expect(res.items).toHaveLength(MIN_VISIBLE_CATALOG_ITEMS);
    expect(res.items[0]?.name).toBe('ivysaur');
    expect(res.items[0]?.isCompanion).toBe(false);

    const evolutionCompanions = res.items.filter((item) => item.relationLabel === 'Evolução');
    expect(evolutionCompanions.map((item) => item.name)).toEqual(['bulbasaur', 'venusaur']);
    expect(
      res.items.some((item) => item.name === 'oddish' && item.relationLabel === 'Mesmo tipo'),
    ).toBe(true);
    expect(new Set(res.items.map((item) => item.id)).size).toBe(MIN_VISIBLE_CATALOG_ITEMS);
  });

  it('fills partial matches when fullCatalog is smaller than minItems if only 1 primary item matched', () => {
    const smallCatalog = SAMPLE_FULL_CATALOG.slice(0, 3);
    const res = buildCatalogDisplayList({
      primaryItems: [{ ...smallCatalog[0]!, score: 0, approximate: false }],
      fullCatalog: smallCatalog,
      enrichedCatalog: [],
      selectedPokemon: null,
    });

    expect(res.primaryCount).toBe(1);
    expect(res.companionCount).toBe(2);
    expect(res.items).toHaveLength(3);
  });
});
