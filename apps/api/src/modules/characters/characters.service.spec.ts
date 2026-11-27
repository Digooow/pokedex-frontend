import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  CHARACTER_INITIAL_PRESETS,
  ZERO_ATTRIBUTE_ALLOCATION,
} from '@pokeverse/shared';
import type {
  CharacterRepository,
  PersistedCharacterWithAttributes,
} from './character.repository';
import { CharactersService } from './characters.service';

const ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';
const CHARACTER_ID = '660e8400-e29b-41d4-a716-446655440000';

function createPersistedCharacter(
  overrides?: Partial<PersistedCharacterWithAttributes>,
): PersistedCharacterWithAttributes {
  const now = new Date('2026-11-27T12:00:00.000Z');
  return {
    id: CHARACTER_ID,
    accountId: ACCOUNT_ID,
    name: 'Lyra Norte',
    originKey: 'highlands',
    appearance: {
      skinTone: 'sand',
      hairStyle: 'braid',
      hairColor: 'copper',
      outfitStyle: 'cloak',
      outfitColor: 'crimson',
    },
    level: 1,
    totalSkillMilestones: BigInt(0),
    availableAttributePoints: 2,
    hpCurrent: 192,
    staminaCurrent: 151,
    manaCurrent: 126,
    hungerCurrent: 100,
    thirstCurrent: 100,
    fatigueCurrent: 0,
    hexQ: -3,
    hexR: 4,
    hexZ: 1,
    presenceMode: 'ONLINE',
    createdAt: now,
    updatedAt: now,
    attributes: {
      physique: 7,
      dexterity: 7,
      stamina: 7,
      magic: 6,
      perception: 6,
      willpower: 6,
      handling: 6,
    },
    ...overrides,
  };
}

describe('CharactersService', () => {
  let repository: jest.Mocked<CharacterRepository>;
  let service: CharactersService;

  beforeEach(() => {
    repository = {
      findPaginatedByAccountId: jest.fn(),
      findByIdForAccount: jest.fn(),
      createCharacterWithAttributes: jest.fn(),
      allocateAttributesAtomically: jest.fn(),
    } as unknown as jest.Mocked<CharacterRepository>;

    service = new CharactersService(repository);
  });

  it('creates a classless character with origin starting hex and computed vitals', async () => {
    const balanced = CHARACTER_INITIAL_PRESETS[0];
    if (!balanced) {
      throw new Error('Missing balanced preset.');
    }

    const persisted = createPersistedCharacter({ availableAttributePoints: 0 });
    repository.createCharacterWithAttributes.mockResolvedValue({
      status: 'created',
      character: persisted,
    });

    const sheet = await service.createCharacter(ACCOUNT_ID, {
      name: '  Lyra   Norte ',
      originKey: 'highlands',
      appearance: {
        skinTone: 'sand',
        hairStyle: 'braid',
        hairColor: 'copper',
        outfitStyle: 'cloak',
        outfitColor: 'crimson',
      },
      initialAttributes: balanced.allocation,
    });

    expect(repository.createCharacterWithAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: ACCOUNT_ID,
        name: 'Lyra Norte',
        normalizedName: 'lyra norte',
        originKey: 'highlands',
        hexQ: -3,
        hexR: 4,
        hexZ: 1,
      }),
    );
    expect(sheet.classlessMode).toBe(true);
    expect(sheet.vitals.starterKitWeightKg).toBeCloseTo(4.2, 5);
    expect(sheet.starterKit).toHaveLength(4);
  });

  it('throws ConflictException when name is taken or account limit reached', async () => {
    const balanced = CHARACTER_INITIAL_PRESETS[0];
    if (!balanced) {
      throw new Error('Missing balanced preset.');
    }

    repository.createCharacterWithAttributes.mockResolvedValueOnce({
      status: 'name_taken',
    });
    await expect(
      service.createCharacter(ACCOUNT_ID, {
        name: 'Lyra Norte',
        originKey: 'settler',
        appearance: {
          skinTone: 'ochre',
          hairStyle: 'short',
          hairColor: 'obsidian',
          outfitStyle: 'tunic',
          outfitColor: 'forest',
        },
        initialAttributes: balanced.allocation,
      }),
    ).rejects.toThrow(ConflictException);

    repository.createCharacterWithAttributes.mockResolvedValueOnce({
      status: 'limit_reached',
    });
    await expect(
      service.createCharacter(ACCOUNT_ID, {
        name: 'Outro Nome',
        originKey: 'settler',
        appearance: {
          skinTone: 'ochre',
          hairStyle: 'short',
          hairColor: 'obsidian',
          outfitStyle: 'tunic',
          outfitColor: 'forest',
        },
        initialAttributes: balanced.allocation,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects invalid initial attribute sum and 0-point allocation', async () => {
    await expect(
      service.createCharacter(ACCOUNT_ID, {
        name: 'Invalido',
        originKey: 'settler',
        appearance: {
          skinTone: 'ochre',
          hairStyle: 'short',
          hairColor: 'obsidian',
          outfitStyle: 'tunic',
          outfitColor: 'forest',
        },
        initialAttributes: { ...ZERO_ATTRIBUTE_ALLOCATION, physique: 4 },
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.allocateAttributePoints(ACCOUNT_ID, CHARACTER_ID, {
        allocations: ZERO_ATTRIBUTE_ALLOCATION,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException on IDOR lookup or missing character allocation and ConflictException on insufficient points', async () => {
    repository.findByIdForAccount.mockResolvedValue(null);
    await expect(
      service.getCharacterById(ACCOUNT_ID, CHARACTER_ID),
    ).rejects.toThrow(NotFoundException);

    repository.allocateAttributesAtomically.mockResolvedValueOnce({
      status: 'not_found',
    });
    await expect(
      service.allocateAttributePoints(ACCOUNT_ID, CHARACTER_ID, {
        allocations: { ...ZERO_ATTRIBUTE_ALLOCATION, physique: 1 },
      }),
    ).rejects.toThrow(NotFoundException);

    repository.allocateAttributesAtomically.mockResolvedValueOnce({
      status: 'insufficient_points',
      availablePoints: 0,
    });
    await expect(
      service.allocateAttributePoints(ACCOUNT_ID, CHARACTER_ID, {
        allocations: { ...ZERO_ATTRIBUTE_ALLOCATION, physique: 1 },
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('returns paginated character list for account', async () => {
    repository.findPaginatedByAccountId.mockResolvedValue({
      items: [createPersistedCharacter()],
      total: 1,
    });

    const list = await service.listCharacters(ACCOUNT_ID, {
      limit: 10,
      offset: 0,
    });
    expect(list.total).toBe(1);
    expect(list.items[0]?.name).toBe('Lyra Norte');
  });
});
