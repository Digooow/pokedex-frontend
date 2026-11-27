import { describe, expect, it } from 'vitest';
import {
  CHARACTER_ATTRIBUTE_KEYS,
  CHARACTER_ATTRIBUTES_META,
  CHARACTER_BASE_ATTRIBUTE,
  CHARACTER_INITIAL_ATTRIBUTE_POOL,
  CHARACTER_INITIAL_PRESETS,
  CHARACTER_ORIGINS,
  ZERO_ATTRIBUTE_ALLOCATION,
} from './character-presets';
import {
  buildInitialAttributes,
  computeCharacterDerivedVitals,
  computeStarterKitWeightKg,
  normalizeCharacterName,
  sanitizeCharacterDisplayName,
  sumAttributeAllocation,
} from './character-rules';
import {
  AllocateAttributesSchema,
  CharacterIdParamSchema,
  CreateCharacterSchema,
  ListCharactersQuerySchema,
} from '../schemas/character.schemas';

const VALID_APPEARANCE = {
  skinTone: 'ochre',
  hairStyle: 'short',
  hairColor: 'obsidian',
  outfitStyle: 'tunic',
  outfitColor: 'forest',
} as const;

describe('character-rules domain and Zod contracts', () => {
  const balancedPreset = CHARACTER_INITIAL_PRESETS[0];
  if (!balancedPreset) {
    throw new Error('Missing balanced preset.');
  }

  it('computes initial attributes, derived vitals, and balanced starter kit weights across origins', () => {
    expect(sumAttributeAllocation(balancedPreset.allocation)).toBe(
      CHARACTER_INITIAL_ATTRIBUTE_POOL,
    );

    const attrs = buildInitialAttributes(balancedPreset.allocation);
    expect(attrs.physique).toBe(CHARACTER_BASE_ATTRIBUTE + balancedPreset.allocation.physique);
    expect(attrs.magic).toBe(CHARACTER_BASE_ATTRIBUTE + balancedPreset.allocation.magic);

    const vitals = computeCharacterDerivedVitals(1, attrs);
    expect(vitals.hpMax).toBe(80 + attrs.stamina * 12 + attrs.physique * 4);
    expect(vitals.staminaMax).toBe(60 + attrs.stamina * 10 + attrs.dexterity * 3);
    expect(vitals.manaMax).toBe(30 + attrs.magic * 12 + attrs.willpower * 4);
    expect(vitals.carryCapacityKg).toBe(
      Number((20 + attrs.physique * 3.5 + attrs.stamina * 1.2).toFixed(1)),
    );
    expect(vitals.companionSlots).toBe(2);

    const starterWeights = CHARACTER_ORIGINS.map((origin) => computeStarterKitWeightKg(origin.key));
    expect(starterWeights).toEqual([4.2, 4.2, 4.2]);

    expect(CHARACTER_ATTRIBUTES_META.map((meta) => meta.key)).toEqual([
      ...CHARACTER_ATTRIBUTE_KEYS,
    ]);
    for (const meta of CHARACTER_ATTRIBUTES_META) {
      expect(meta.label.trim().length).toBeGreaterThan(0);
      expect(meta.shortLabel.trim().length).toBeGreaterThan(0);
      expect(meta.subtitle.trim().length).toBeGreaterThan(0);
      expect(meta.mechanicalImpact.trim().length).toBeGreaterThan(0);
    }

    expect(CHARACTER_ORIGINS).toHaveLength(3);
    for (const origin of CHARACTER_ORIGINS) {
      const outfit = origin.starterKit[0];
      expect(outfit?.category).toBe('outfit');
      expect(outfit?.weightKg).toBeCloseTo(1.2, 5);
      expect(outfit?.durabilityMax).toBe(60);
    }
  });

  it('normalizes display and uniqueness names safely', () => {
    expect(sanitizeCharacterDisplayName('  Kael   Vance  ')).toBe('Kael Vance');
    expect(normalizeCharacterName('  Kael   Vance  ')).toBe('kael vance');
  });

  it('rejects invalid CreateCharacterSchema payloads (sum != 10, negatives, bad names, extra fields)', () => {
    const validPayload = {
      name: 'Lyra_Norte',
      originKey: 'settler',
      appearance: VALID_APPEARANCE,
      initialAttributes: balancedPreset.allocation,
    };
    expect(CreateCharacterSchema.safeParse(validPayload).success).toBe(true);

    const sumNine = {
      ...validPayload,
      initialAttributes: { ...ZERO_ATTRIBUTE_ALLOCATION, physique: 9 },
    };
    expect(CreateCharacterSchema.safeParse(sumNine).success).toBe(false);

    const sumEleven = {
      ...validPayload,
      initialAttributes: { ...ZERO_ATTRIBUTE_ALLOCATION, physique: 11 },
    };
    expect(CreateCharacterSchema.safeParse(sumEleven).success).toBe(false);

    const negativeAttr = {
      ...validPayload,
      initialAttributes: { ...balancedPreset.allocation, physique: -1, magic: 3 },
    };
    expect(CreateCharacterSchema.safeParse(negativeAttr).success).toBe(false);

    for (const badName of ['ab', 'a'.repeat(25), 'Kael!@#', 'Kael  Duplo']) {
      expect(CreateCharacterSchema.safeParse({ ...validPayload, name: badName }).success).toBe(
        false,
      );
    }

    const withExtraClassField = { ...validPayload, className: 'Warrior' };
    expect(CreateCharacterSchema.safeParse(withExtraClassField).success).toBe(false);
  });

  it('validates AllocateAttributesSchema, CharacterIdParamSchema, and ListCharactersQuerySchema', () => {
    expect(
      AllocateAttributesSchema.safeParse({ allocations: ZERO_ATTRIBUTE_ALLOCATION }).success,
    ).toBe(false);
    expect(
      AllocateAttributesSchema.safeParse({
        allocations: { ...ZERO_ATTRIBUTE_ALLOCATION, perception: 2 },
      }).success,
    ).toBe(true);

    expect(CharacterIdParamSchema.safeParse('not-uuid').success).toBe(false);
    expect(CharacterIdParamSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(
      true,
    );

    const defaults = ListCharactersQuerySchema.parse({});
    expect(defaults).toEqual({ limit: 10, offset: 0 });
    expect(ListCharactersQuerySchema.safeParse({ limit: 21 }).success).toBe(false);
  });
});
