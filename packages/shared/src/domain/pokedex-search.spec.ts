import { describe, expect, it } from 'vitest';
import {
  buildPhoneticKey,
  buildSearchableCatalogItem,
  cleanComparisonText,
  computeDamerauDistance,
  extractPokemonIdFromUrl,
  filterPokemonCatalog,
  formatPokeApiText,
} from './pokedex-search';

const SAMPLE_CATALOG = [
  buildSearchableCatalogItem(1, 'bulbasaur'),
  buildSearchableCatalogItem(4, 'charmander'),
  buildSearchableCatalogItem(25, 'pikachu'),
  buildSearchableCatalogItem(26, 'raichu'),
  buildSearchableCatalogItem(92, 'gastly'),
  buildSearchableCatalogItem(94, 'gengar'),
  buildSearchableCatalogItem(150, 'mewtwo'),
  buildSearchableCatalogItem(250, 'ho-oh'),
  buildSearchableCatalogItem(669, 'flabebe'),
  buildSearchableCatalogItem(1000, 'gholdengo'),
];

describe('pokedex-search domain', () => {
  it('handles empty catalogs and zero limits gracefully', () => {
    expect(filterPokemonCatalog([], 'pikachu')).toEqual({ mode: 'all', items: [] });
    expect(filterPokemonCatalog(SAMPLE_CATALOG, 'pikachu', 0)).toEqual({ mode: 'all', items: [] });
    expect(filterPokemonCatalog(SAMPLE_CATALOG, '   ', 2).items).toHaveLength(2);
  });

  it('normalizes accents, symbols, and phonetic spelling', () => {
    expect(cleanComparisonText('Flabébé!')).toBe('flabebe');
    expect(buildPhoneticKey('Phantump')).toBe(buildPhoneticKey('Fantump'));
    expect(formatPokeApiText('ho-oh')).toBe('Ho Oh');
    expect(formatPokeApiText('')).toBe('Não informado');
  });

  it('finds exact numeric IDs with optional hash prefix', () => {
    const res = filterPokemonCatalog(SAMPLE_CATALOG, '#025');
    expect(res.mode).toBe('exact');
    expect(res.items[0]?.id).toBe(25);
    expect(res.items[0]?.approximate).toBe(false);
  });

  it('matches phonetic typos and Damerau transpositions', () => {
    expect(computeDamerauDistance('ab', 'ba', 2)).toBe(1);
    const typo = filterPokemonCatalog(SAMPLE_CATALOG, 'pikaxu');
    expect(typo.mode).toBe('approximate');
    expect(typo.items[0]?.name).toBe('pikachu');

    const flipped = filterPokemonCatalog(SAMPLE_CATALOG, 'pikahcu');
    expect(flipped.items[0]?.name).toBe('pikachu');
  });

  it('scales cleanly over 1400 synthetic entries without throwing', () => {
    const largeCatalog = Array.from({ length: 1400 }, (_, idx) =>
      buildSearchableCatalogItem(idx + 1, idx === 999 ? 'rayquaza' : `mon-${idx + 1}`),
    );
    const res = filterPokemonCatalog(largeCatalog, 'raikuasa');
    expect(res.items[0]?.name).toBe('rayquaza');
  });

  it('extracts safe positive numeric IDs from PokéAPI URLs', () => {
    expect(extractPokemonIdFromUrl('https://pokeapi.co/api/v2/pokemon/25/')).toBe(25);
    expect(extractPokemonIdFromUrl('invalid-url')).toBe(0);
    expect(extractPokemonIdFromUrl('https://pokeapi.co/api/v2/pokemon/0/')).toBe(0);
  });
});
