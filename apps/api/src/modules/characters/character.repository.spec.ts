import { Prisma } from '@prisma/client';
import {
  createDeepPrismaMock,
  type DeepPrismaMock,
} from '../../testing/prisma-mock.helper';
import {
  CharacterRepository,
  type PersistedCharacterWithAttributes,
} from './character.repository';

function createPersistedCharacterFixture(
  overrides?: Partial<PersistedCharacterWithAttributes>,
): PersistedCharacterWithAttributes {
  const now = new Date('2026-11-27T12:00:00.000Z');
  return {
    id: '660e8400-e29b-41d4-a716-446655440000',
    accountId: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Kael Norte',
    originKey: 'settler',
    appearance: {
      skinTone: 'ochre',
      hairStyle: 'short',
      hairColor: 'obsidian',
      outfitStyle: 'tunic',
      outfitColor: 'forest',
    },
    level: 1,
    totalSkillMilestones: BigInt(0),
    availableAttributePoints: 0,
    hpCurrent: 192,
    staminaCurrent: 151,
    manaCurrent: 126,
    hungerCurrent: 100,
    thirstCurrent: 100,
    fatigueCurrent: 0,
    hexQ: 0,
    hexR: 0,
    hexZ: 0,
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

function mockInteractiveTransaction(prisma: DeepPrismaMock): void {
  const txFn = prisma.$transaction as unknown as jest.Mock;
  txFn.mockImplementation((callback: unknown) => {
    if (typeof callback === 'function') {
      return Promise.resolve(
        (callback as (tx: DeepPrismaMock) => Promise<unknown>)(prisma),
      );
    }
    return Promise.resolve([]);
  });
}

describe('CharacterRepository', () => {
  let prisma: DeepPrismaMock;
  let repository: CharacterRepository;

  beforeEach(() => {
    prisma = createDeepPrismaMock();
    repository = new CharacterRepository(prisma);
  });

  it('returns limit_reached when account already has 5 characters', async () => {
    mockInteractiveTransaction(prisma);
    prisma.character.count.mockResolvedValue(5);

    const result = await repository.createCharacterWithAttributes({
      accountId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Sexto',
      normalizedName: 'sexto',
      originKey: 'settler',
      appearance: {
        skinTone: 'sand',
        hairStyle: 'long',
        hairColor: 'copper',
        outfitStyle: 'cloak',
        outfitColor: 'slate',
      },
      attributes: {
        physique: 7,
        dexterity: 7,
        stamina: 7,
        magic: 6,
        perception: 6,
        willpower: 6,
        handling: 6,
      },
      hpCurrent: 192,
      staminaCurrent: 151,
      manaCurrent: 126,
      hexQ: 0,
      hexR: 0,
      hexZ: 0,
    });

    expect(result).toEqual({ status: 'limit_reached' });
  });

  it('maps Prisma P2002 unique constraint error to name_taken', async () => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );

    const result = await repository.createCharacterWithAttributes({
      accountId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Kael Norte',
      normalizedName: 'kael norte',
      originKey: 'settler',
      appearance: {
        skinTone: 'ochre',
        hairStyle: 'short',
        hairColor: 'obsidian',
        outfitStyle: 'tunic',
        outfitColor: 'forest',
      },
      attributes: {
        physique: 7,
        dexterity: 7,
        stamina: 7,
        magic: 6,
        perception: 6,
        willpower: 6,
        handling: 6,
      },
      hpCurrent: 192,
      staminaCurrent: 151,
      manaCurrent: 126,
      hexQ: 0,
      hexR: 0,
      hexZ: 0,
    });

    expect(result).toEqual({ status: 'name_taken' });
  });

  it('returns insufficient_points when conditional decrement claims 0 rows on existing character', async () => {
    mockInteractiveTransaction(prisma);
    prisma.character.updateMany.mockResolvedValue({ count: 0 });
    prisma.character.findFirst.mockResolvedValue({
      availableAttributePoints: 1,
    } as never);

    const result = await repository.allocateAttributesAtomically({
      characterId: '660e8400-e29b-41d4-a716-446655440000',
      accountId: '550e8400-e29b-41d4-a716-446655440000',
      allocations: {
        physique: 2,
        dexterity: 0,
        stamina: 0,
        magic: 0,
        perception: 0,
        willpower: 0,
        handling: 0,
      },
      totalPoints: 2,
    });

    expect(result).toEqual({
      status: 'insufficient_points',
      availablePoints: 1,
    });
  });

  it('updates attributes and derived vitals atomically when points are available', async () => {
    mockInteractiveTransaction(prisma);
    prisma.character.updateMany.mockResolvedValue({ count: 1 });
    prisma.characterAttribute.update.mockResolvedValue({
      physique: 8,
      dexterity: 7,
      stamina: 8,
      magic: 6,
      perception: 6,
      willpower: 6,
      handling: 6,
    } as never);
    prisma.character.findUniqueOrThrow.mockResolvedValue({
      level: 2,
      hpCurrent: 150,
      staminaCurrent: 120,
      manaCurrent: 100,
    } as never);
    const updatedFixture = createPersistedCharacterFixture({
      level: 2,
      hpCurrent: 166,
      staminaCurrent: 130,
      manaCurrent: 100,
      attributes: {
        physique: 8,
        dexterity: 7,
        stamina: 8,
        magic: 6,
        perception: 6,
        willpower: 6,
        handling: 6,
      },
    });
    prisma.character.update.mockResolvedValue(updatedFixture as never);

    const result = await repository.allocateAttributesAtomically({
      characterId: updatedFixture.id,
      accountId: updatedFixture.accountId,
      allocations: {
        physique: 1,
        dexterity: 0,
        stamina: 1,
        magic: 0,
        perception: 0,
        willpower: 0,
        handling: 0,
      },
      totalPoints: 2,
    });

    expect(result).toEqual({ status: 'updated', character: updatedFixture });
  });
});
