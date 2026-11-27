import {
  detectAttributeShortcut,
  formatEggGroupLabelPt,
  formatHabitatLabelPt,
  formatTypeLabelPt,
  matchesAllowedSpeciesSet,
} from './pokedex-attribute-search.util';

describe('pokedex-attribute-search.util', () => {
  it('formats type, egg group, and habitat labels in Portuguese', () => {
    expect(formatTypeLabelPt('electric')).toBe('Elétrico');
    expect(formatEggGroupLabelPt('dragon')).toBe('Dragão');
    expect(formatHabitatLabelPt('forest')).toBe('Floresta');
  });

  it('detects attribute shortcuts for element, region, habitat, race, and game', () => {
    expect(detectAttributeShortcut('fogo')).toEqual({
      kind: 'type',
      value: 'fire',
      label: 'Elemento: Fogo',
    });
    expect(detectAttributeShortcut('Kanto')).toEqual({
      kind: 'region',
      value: 'kanto',
      label: 'Mapa: Kanto (Gen I)',
    });
    expect(detectAttributeShortcut('floresta')).toEqual({
      kind: 'habitat',
      value: 'forest',
      label: 'Habitat: Floresta',
    });
    expect(detectAttributeShortcut('monstro')).toEqual({
      kind: 'eggGroup',
      value: 'monster',
      label: 'Raça: Monstro',
    });
    expect(detectAttributeShortcut('Scarlet')).toEqual({
      kind: 'game',
      value: 'scarlet-violet',
      label: 'Jogo: Scarlet / Violet',
    });
    expect(detectAttributeShortcut('pikachu')).toBeNull();
  });

  it('matches both exact species names and alternate form suffixes against allowed species set', () => {
    const allowed = new Set(['pikachu', 'charizard', 'mr-mime']);
    expect(matchesAllowedSpeciesSet('pikachu', allowed)).toBe(true);
    expect(matchesAllowedSpeciesSet('charizard-mega-x', allowed)).toBe(true);
    expect(matchesAllowedSpeciesSet('mr-mime-galar', allowed)).toBe(true);
    expect(matchesAllowedSpeciesSet('pidgeot', allowed)).toBe(false);
  });
});
