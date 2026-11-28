import { describe, expect, it } from 'vitest';
import {
  BAZAAR_VETERAN_SHOWCASE,
  buildBazaarListingFromSheet,
  computeBazaarCommission,
} from './character-bazaar';
import {
  CHARACTER_EMERGENT_ARCHETYPES,
  CHARACTER_PROFESSION_GROUPS,
  CHARACTER_SKILL_NODES,
  SKILL_CASCADE_RATIOS,
  applySkillTrainingAction,
  computeSkillChainModifier,
  createInitialTrainingState,
  getSkillAncestorChain,
} from './character-progression';
import { CHARACTER_INITIAL_PRESETS } from './character-presets';
import { buildInitialAttributes } from './character-rules';
import { CharacterAppearanceSchema, CharacterSheetSchema } from '../schemas/character.schemas';

describe('character-progression & bazaar domain', () => {
  it('preserves backward compatibility on CharacterAppearanceSchema and defaults bodyModel to male', () => {
    const legacy = CharacterAppearanceSchema.parse({
      skinTone: 'ochre',
      hairStyle: 'short',
      hairColor: 'obsidian',
      outfitStyle: 'tunic',
      outfitColor: 'forest',
    });
    expect(legacy.bodyModel).toBe('male');

    const minimal = CharacterAppearanceSchema.parse({ bodyModel: 'female' });
    expect(minimal.bodyModel).toBe('female');
    expect(minimal.skinTone).toBe('ochre');
  });

  it('propagates cascading XP along the 6-layer Excalibur chain and trains attributes without level', () => {
    const chain = getSkillAncestorChain('mastery_excalibur');
    expect(chain.map((node) => node.id)).toEqual([
      'mastery_excalibur',
      'greatswords',
      'two_handed_swords',
      'swords',
      'melee_weapons',
      'weapons',
    ]);
    expect(SKILL_CASCADE_RATIOS).toEqual([1, 0.65, 0.45, 0.3, 0.2, 0.1]);

    const preset = CHARACTER_INITIAL_PRESETS[0]!;
    const attrs = buildInitialAttributes(preset.allocation);
    let state = createInitialTrainingState(attrs);

    const step1 = applySkillTrainingAction(state, 'mastery_excalibur', 40);
    expect(step1.skillGains[0]?.xpAdded).toBe(40);
    expect(step1.skillGains[1]?.xpAdded).toBe(26);
    expect(step1.skillGains[5]?.xpAdded).toBe(4);
    expect(step1.nextState.skills['mastery_excalibur']?.rank).toBe(1);
    expect(step1.nextState.emergentArchetype.key).toBe('duelist');

    state = step1.nextState;
    for (let i = 0; i < 12; i += 1) {
      state = applySkillTrainingAction(state, 'mastery_excalibur', 45).nextState;
    }

    expect(state.attributes.physique).toBeGreaterThan(attrs.physique);
    expect(state.totalMilestones).toBeGreaterThan(0);
    const modifier = computeSkillChainModifier('mastery_excalibur', state.skills);
    expect(modifier).toBeGreaterThan(1);
    expect(modifier).toBeLessThanOrEqual(2.3);
  });

  it('exposes all 7 emergent archetypes, 15 professions, and calculates Bazaar 8% commission cleanly', () => {
    expect(CHARACTER_EMERGENT_ARCHETYPES).toHaveLength(7);
    const professionIds = CHARACTER_PROFESSION_GROUPS.flatMap((group) => group.skillIds);
    expect(professionIds).toHaveLength(15);
    expect(CHARACTER_SKILL_NODES.length).toBeGreaterThanOrEqual(30);

    const fee = computeBazaarCommission(10_000);
    expect(fee).toEqual({
      grossCoins: 10_000,
      platformFeeCoins: 800,
      sellerNetCoins: 9_200,
      feePercent: 8,
    });

    expect(BAZAAR_VETERAN_SHOWCASE).toHaveLength(4);
    const now = new Date().toISOString();
    const sheet = CharacterSheetSchema.parse({
      id: '660e8400-e29b-41d4-a716-446655440000',
      accountId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Kael Teste',
      originKey: 'settler',
      originLabel: 'Filho de Colono',
      startingRegionName: 'Planície dos Marcos',
      classlessMode: true,
      appearance: { bodyModel: 'female' },
      level: 1,
      totalSkillMilestones: 12,
      availableAttributePoints: 0,
      hexQ: 0,
      hexR: 0,
      hexZ: 0,
      presenceMode: 'ONLINE',
      attributes: buildInitialAttributes(CHARACTER_INITIAL_PRESETS[0]!.allocation),
      vitals: {
        hpCurrent: 180,
        hpMax: 180,
        staminaCurrent: 140,
        staminaMax: 140,
        manaCurrent: 110,
        manaMax: 110,
        hungerCurrent: 100,
        hungerMax: 100,
        thirstCurrent: 100,
        thirstMax: 100,
        fatigueCurrent: 0,
        fatigueMax: 100,
        carryCapacityKg: 50,
        starterKitWeightKg: 4.2,
        baseDodgeRating: 18,
        baseDetectionRadius: 8,
        curseResistanceBase: 20,
        companionSlots: 2,
      },
      starterKit: [],
      createdAt: now,
      updatedAt: now,
    });

    const listed = buildBazaarListingFromSheet({
      sheet,
      attributes: sheet.attributes,
      totalMilestones: 25,
      askingPriceCoins: 5000,
      archetypeLabel: 'Espadachim Duelista',
      topSkills: ['Espadas (8)'],
      sellerAlias: 'Red_Kanto',
    });
    expect(listed.bodyModel).toBe('female');
    expect(listed.isPlayerListing).toBe(true);
    expect(listed.askingPriceCoins).toBe(5000);
  });
});
