import { describe, expect, it } from 'vitest';
import {
  POKEAPI_V2_ENDPOINTS,
  filterCatalogWithAdvancedQuery,
  type EnrichedCatalogItem,
} from './pokeapi-endpoints';
import { buildSearchableCatalogItem } from './pokedex-search';
import {
  calculateReplicationAndCloning,
  calculateSpeciesAscension,
  calculateStatsAtLevel,
  calculateXpForLevel,
  evaluateEvolutionChance,
} from './pokemon-lab';

describe('PokéAPI v2 51-endpoint catalog and Advanced Query Engine', () => {
  it('registers all 51 official endpoints without duplicate keys', () => {
    expect(POKEAPI_V2_ENDPOINTS).toHaveLength(51);
    const uniqueKeys = new Set(POKEAPI_V2_ENDPOINTS.map((entry) => entry.key));
    expect(uniqueKeys.size).toBe(51);
  });

  it('filters by multiple criteria (types, generation, BST, rarity) and sorts accurately', () => {
    const sample: EnrichedCatalogItem[] = [
      {
        ...buildSearchableCatalogItem(25, 'pikachu'),
        types: ['electric'],
        generation: 1,
        baseStatTotal: 320,
      },
      {
        ...buildSearchableCatalogItem(145, 'zapdos'),
        types: ['electric', 'flying'],
        generation: 1,
        baseStatTotal: 580,
        isLegendary: true,
      },
      {
        ...buildSearchableCatalogItem(384, 'rayquaza'),
        types: ['dragon', 'flying'],
        generation: 3,
        baseStatTotal: 680,
        isLegendary: true,
      },
      {
        ...buildSearchableCatalogItem(643, 'reshiram'),
        types: ['dragon', 'fire'],
        generation: 5,
        baseStatTotal: 680,
        isLegendary: true,
      },
    ];

    const legendsGen1 = filterCatalogWithAdvancedQuery(sample, {
      types: ['electric'],
      onlyLegendary: true,
      generation: 1,
    });
    expect(legendsGen1.map((item) => item.name)).toEqual(['zapdos']);

    const sortedHighBst = filterCatalogWithAdvancedQuery(sample, {
      minBst: 550,
      sortBy: 'bst-desc',
    });
    expect(sortedHighBst.map((item) => item.name)).toEqual(['rayquaza', 'reshiram', 'zapdos']);
  });
});

describe('Pokémon Stat Simulator & Genetic Evolution Lab', () => {
  it('calculates exact Gen III-IX stats across levels and XP growth curves', () => {
    const level100Garchomp = calculateStatsAtLevel({
      level: 100,
      baseStats: {
        hp: 108,
        attack: 130,
        defense: 95,
        specialAttack: 80,
        specialDefense: 85,
        speed: 102,
      },
      evs: { hp: 0, attack: 252, defense: 0, specialAttack: 0, specialDefense: 4, speed: 252 },
      natureModifiers: { attack: 1.1, defense: 1, specialAttack: 0.9, specialDefense: 1, speed: 1 },
    });

    expect(level100Garchomp.hp).toBe(357);
    expect(level100Garchomp.attack).toBe(394);
    expect(level100Garchomp.speed).toBe(303);
    expect(calculateXpForLevel(1, 'slow')).toBe(0);
    expect(calculateXpForLevel(100, 'slow')).toBe(1_250_000);
    expect(calculateXpForLevel(100, 'fast')).toBe(800_000);
  });

  it('evaluates evolution readiness and blocks when requirements are missing', () => {
    const blocked = evaluateEvolutionChance({
      currentLevel: 14,
      requiredLevel: 16,
      hasRequiredItem: false,
      requiredItemName: 'Fire Stone',
    });
    expect(blocked.canEvolve).toBe(false);
    expect(blocked.probabilityPercent).toBeLessThanOrEqual(49);
    expect(blocked.missingRequirements).toHaveLength(2);
    expect(blocked.recommendedCatalyst).toBe('Fire Stone');

    const ready = evaluateEvolutionChance({
      currentLevel: 36,
      requiredLevel: 36,
      happiness: 230,
      requiredHappiness: 220,
      biomeStability: 95,
      geneticResonance: 90,
      catalystBoostPercent: 10,
    });
    expect(ready.canEvolve).toBe(true);
    expect(ready.probabilityPercent).toBeGreaterThanOrEqual(95);
  });

  it('models replication, cloning fidelity, and species ascension recycling', () => {
    const cloning = calculateReplicationAndCloning({
      baseStatTotal: 600,
      rarityTier: 'pseudo-legendary',
      labTier: 4,
      stabilizerCount: 2,
      sourceIvPerfectCount: 5,
    });
    expect(cloning.replicationSuccessPercent).toBeGreaterThan(75);
    expect(cloning.guaranteedPerfectIvs).toBe(4);
    expect(cloning.bioEnergyCost).toBe(1080);

    const ascension = calculateSpeciesAscension({
      recycledSameSpeciesCount: 25,
      recycledEggGroupCount: 15,
      averageSpecimenLevel: 50,
      shinyRecycledCount: 1,
      existingEssence: 10,
    });
    expect(ascension.bioEssenceGained).toBe(585);
    expect(ascension.totalEssence).toBe(595);
    expect(ascension.rank).toBe('APEX');
    expect(ascension.apexSpeciesEvolutionUnlocked).toBe(true);
    expect(ascension.statResonanceBonusPercent).toBe(12);
    expect(ascension.ivHyperTrainTokens).toBe(5);
  });
});
