import { Injectable } from '@nestjs/common';
import {
  CHARACTER_MAX_PER_ACCOUNT,
  type CharacterAppearance,
  type CharacterAttributeAllocation,
  type CharacterAttributes,
  type CharacterOriginKey,
  type CharacterPresenceMode,
  computeCharacterDerivedVitals,
} from '@pokeverse/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma.service';

export const CHARACTER_ATTRIBUTES_SELECT = {
  physique: true,
  dexterity: true,
  stamina: true,
  magic: true,
  perception: true,
  willpower: true,
  handling: true,
} as const;

export const CHARACTER_WITH_ATTRIBUTES_SELECT = {
  id: true,
  accountId: true,
  name: true,
  originKey: true,
  appearance: true,
  level: true,
  totalSkillMilestones: true,
  availableAttributePoints: true,
  hpCurrent: true,
  staminaCurrent: true,
  manaCurrent: true,
  hungerCurrent: true,
  thirstCurrent: true,
  fatigueCurrent: true,
  hexQ: true,
  hexR: true,
  hexZ: true,
  presenceMode: true,
  createdAt: true,
  updatedAt: true,
  attributes: { select: CHARACTER_ATTRIBUTES_SELECT },
} as const;

export interface PersistedCharacterWithAttributes {
  readonly id: string;
  readonly accountId: string;
  readonly name: string;
  readonly originKey: string;
  readonly appearance: Prisma.JsonValue;
  readonly level: number;
  readonly totalSkillMilestones: bigint;
  readonly availableAttributePoints: number;
  readonly hpCurrent: number;
  readonly staminaCurrent: number;
  readonly manaCurrent: number;
  readonly hungerCurrent: number;
  readonly thirstCurrent: number;
  readonly fatigueCurrent: number;
  readonly hexQ: number;
  readonly hexR: number;
  readonly hexZ: number;
  readonly presenceMode: CharacterPresenceMode;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly attributes: CharacterAttributes | null;
}

export interface CreateCharacterRecordParams {
  readonly accountId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly originKey: CharacterOriginKey;
  readonly appearance: CharacterAppearance;
  readonly attributes: CharacterAttributes;
  readonly hpCurrent: number;
  readonly staminaCurrent: number;
  readonly manaCurrent: number;
  readonly hexQ: number;
  readonly hexR: number;
  readonly hexZ: number;
}

export type CreateCharacterRecordResult =
  | { readonly status: 'limit_reached' }
  | { readonly status: 'name_taken' }
  | {
      readonly status: 'created';
      readonly character: PersistedCharacterWithAttributes;
    };

export type AllocateAttributesRecordResult =
  | { readonly status: 'not_found' }
  | { readonly status: 'insufficient_points'; readonly availablePoints: number }
  | {
      readonly status: 'updated';
      readonly character: PersistedCharacterWithAttributes;
    };

function computeAdjustedVitalsAfterAllocation(params: {
  readonly level: number;
  readonly hpCurrent: number;
  readonly staminaCurrent: number;
  readonly manaCurrent: number;
  readonly updatedAttrs: CharacterAttributes;
  readonly allocations: CharacterAttributeAllocation;
}) {
  const previousAttrs: CharacterAttributes = {
    physique: params.updatedAttrs.physique - params.allocations.physique,
    dexterity: params.updatedAttrs.dexterity - params.allocations.dexterity,
    stamina: params.updatedAttrs.stamina - params.allocations.stamina,
    magic: params.updatedAttrs.magic - params.allocations.magic,
    perception: params.updatedAttrs.perception - params.allocations.perception,
    willpower: params.updatedAttrs.willpower - params.allocations.willpower,
    handling: params.updatedAttrs.handling - params.allocations.handling,
  };
  const prevVitals = computeCharacterDerivedVitals(params.level, previousAttrs);
  const nextVitals = computeCharacterDerivedVitals(
    params.level,
    params.updatedAttrs,
  );

  return {
    hpCurrent: Math.min(
      params.hpCurrent + Math.max(0, nextVitals.hpMax - prevVitals.hpMax),
      nextVitals.hpMax,
    ),
    staminaCurrent: Math.min(
      params.staminaCurrent +
        Math.max(0, nextVitals.staminaMax - prevVitals.staminaMax),
      nextVitals.staminaMax,
    ),
    manaCurrent: Math.min(
      params.manaCurrent + Math.max(0, nextVitals.manaMax - prevVitals.manaMax),
      nextVitals.manaMax,
    ),
  };
}

@Injectable()
export class CharacterRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPaginatedByAccountId(
    accountId: string,
    pagination: { readonly limit: number; readonly offset: number },
  ): Promise<{
    readonly items: PersistedCharacterWithAttributes[];
    readonly total: number;
  }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.character.findMany({
        where: { accountId },
        take: pagination.limit,
        skip: pagination.offset,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: CHARACTER_WITH_ATTRIBUTES_SELECT,
      }),
      this.prisma.character.count({ where: { accountId } }),
    ]);

    return { items, total };
  }

  findByIdForAccount(
    characterId: string,
    accountId: string,
  ): Promise<PersistedCharacterWithAttributes | null> {
    return this.prisma.character.findFirst({
      where: { id: characterId, accountId },
      select: CHARACTER_WITH_ATTRIBUTES_SELECT,
    });
  }

  async createCharacterWithAttributes(
    params: CreateCharacterRecordParams,
  ): Promise<CreateCharacterRecordResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingCount = await tx.character.count({
          where: { accountId: params.accountId },
        });
        if (existingCount >= CHARACTER_MAX_PER_ACCOUNT) {
          return { status: 'limit_reached' };
        }

        const character = await tx.character.create({
          data: {
            accountId: params.accountId,
            name: params.name,
            normalizedName: params.normalizedName,
            originKey: params.originKey,
            appearance: params.appearance,
            hpCurrent: params.hpCurrent,
            staminaCurrent: params.staminaCurrent,
            manaCurrent: params.manaCurrent,
            hexQ: params.hexQ,
            hexR: params.hexR,
            hexZ: params.hexZ,
            attributes: {
              create: { ...params.attributes },
            },
          },
          select: CHARACTER_WITH_ATTRIBUTES_SELECT,
        });

        return { status: 'created', character };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { status: 'name_taken' };
      }
      throw error;
    }
  }

  allocateAttributesAtomically(params: {
    readonly characterId: string;
    readonly accountId: string;
    readonly allocations: CharacterAttributeAllocation;
    readonly totalPoints: number;
  }): Promise<AllocateAttributesRecordResult> {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.character.updateMany({
        where: {
          id: params.characterId,
          accountId: params.accountId,
          availableAttributePoints: { gte: params.totalPoints },
        },
        data: {
          availableAttributePoints: { decrement: params.totalPoints },
        },
      });

      if (claim.count === 0) {
        return this.resolveAllocationClaimMiss(
          tx,
          params.characterId,
          params.accountId,
        );
      }

      return this.applyIncrementAndRefreshVitals(
        tx,
        params.characterId,
        params.allocations,
      );
    });
  }

  private async resolveAllocationClaimMiss(
    tx: Prisma.TransactionClient,
    characterId: string,
    accountId: string,
  ): Promise<AllocateAttributesRecordResult> {
    const existing = await tx.character.findFirst({
      where: { id: characterId, accountId },
      select: { availableAttributePoints: true },
    });
    if (!existing) {
      return { status: 'not_found' };
    }
    return {
      status: 'insufficient_points',
      availablePoints: existing.availableAttributePoints,
    };
  }

  private async applyIncrementAndRefreshVitals(
    tx: Prisma.TransactionClient,
    characterId: string,
    allocations: CharacterAttributeAllocation,
  ): Promise<AllocateAttributesRecordResult> {
    const updatedAttrs = await tx.characterAttribute.update({
      where: { characterId },
      data: {
        physique: { increment: allocations.physique },
        dexterity: { increment: allocations.dexterity },
        stamina: { increment: allocations.stamina },
        magic: { increment: allocations.magic },
        perception: { increment: allocations.perception },
        willpower: { increment: allocations.willpower },
        handling: { increment: allocations.handling },
      },
      select: CHARACTER_ATTRIBUTES_SELECT,
    });

    const currentState = await tx.character.findUniqueOrThrow({
      where: { id: characterId },
      select: {
        level: true,
        hpCurrent: true,
        staminaCurrent: true,
        manaCurrent: true,
      },
    });

    const nextVitals = computeAdjustedVitalsAfterAllocation({
      ...currentState,
      updatedAttrs,
      allocations,
    });

    const updatedCharacter = await tx.character.update({
      where: { id: characterId },
      data: nextVitals,
      select: CHARACTER_WITH_ATTRIBUTES_SELECT,
    });

    return { status: 'updated', character: updatedCharacter };
  }
}
