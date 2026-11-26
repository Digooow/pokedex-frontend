import { Injectable } from '@nestjs/common';
import {
  type SavePokedexSlotInput,
  TOTAL_POKEDEX_SLOTS,
} from '@pokeverse/shared';
import { OutboxStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma.service';

const POKEDEX_SLOT_AGGREGATE_TYPE = 'PokedexSlot';

const POKEDEX_SLOT_SELECT = {
  slotIndex: true,
  pokemonId: true,
  pokemonName: true,
  nickname: true,
  spriteUrl: true,
  updatedAt: true,
} as const;

export interface PersistedPokedexSlot {
  readonly slotIndex: number;
  readonly pokemonId: number;
  readonly pokemonName: string;
  readonly nickname: string | null;
  readonly spriteUrl: string | null;
  readonly updatedAt: Date;
}

export interface SlotOutboxEventInput {
  readonly id: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: Prisma.InputJsonValue;
}

export interface UpsertPokedexSlotParams {
  readonly trainerId: string;
  readonly slotIndex: number;
  readonly input: SavePokedexSlotInput;
  readonly outboxEvent: SlotOutboxEventInput;
}

export type UpsertPokedexSlotResult =
  | { readonly status: 'duplicate'; readonly existingSlotIndex: number }
  | { readonly status: 'saved'; readonly slot: PersistedPokedexSlot };

@Injectable()
export class PokedexSlotRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTrainerId(trainerId: string): Promise<PersistedPokedexSlot[]> {
    return this.prisma.pokedexSlot.findMany({
      where: { trainerId },
      orderBy: { slotIndex: 'asc' },
      take: TOTAL_POKEDEX_SLOTS,
      select: POKEDEX_SLOT_SELECT,
    });
  }

  upsertSlotWithOutbox(
    params: UpsertPokedexSlotParams,
  ): Promise<UpsertPokedexSlotResult> {
    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.pokedexSlot.findFirst({
        where: {
          trainerId: params.trainerId,
          slotIndex: { not: params.slotIndex },
          OR: [
            { pokemonId: params.input.pokemonId },
            {
              pokemonName: {
                equals: params.input.pokemonName,
                mode: 'insensitive',
              },
            },
          ],
        },
        select: { slotIndex: true },
      });

      if (duplicate) {
        return { status: 'duplicate', existingSlotIndex: duplicate.slotIndex };
      }

      const slot = await tx.pokedexSlot.upsert({
        where: {
          trainerId_slotIndex: {
            trainerId: params.trainerId,
            slotIndex: params.slotIndex,
          },
        },
        update: {
          pokemonId: params.input.pokemonId,
          pokemonName: params.input.pokemonName,
          nickname: params.input.nickname ?? null,
          spriteUrl: params.input.spriteUrl ?? null,
        },
        create: {
          trainerId: params.trainerId,
          slotIndex: params.slotIndex,
          pokemonId: params.input.pokemonId,
          pokemonName: params.input.pokemonName,
          nickname: params.input.nickname ?? null,
          spriteUrl: params.input.spriteUrl ?? null,
        },
        select: POKEDEX_SLOT_SELECT,
      });

      await this.enqueueSlotOutboxEvent(tx, params.outboxEvent);

      return { status: 'saved', slot };
    });
  }

  deleteSlotWithOutbox(
    trainerId: string,
    slotIndex: number,
    outboxEvent: SlotOutboxEventInput,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.pokedexSlot.deleteMany({
        where: { trainerId, slotIndex },
      });

      if (deleted.count === 0) {
        return false;
      }

      await this.enqueueSlotOutboxEvent(tx, outboxEvent);

      return true;
    });
  }

  deleteAllSlotsWithOutbox(
    trainerId: string,
    outboxEvent: SlotOutboxEventInput,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.pokedexSlot.deleteMany({
        where: { trainerId },
      });

      if (deleted.count === 0) {
        return 0;
      }

      await this.enqueueSlotOutboxEvent(tx, outboxEvent);

      return deleted.count;
    });
  }

  swapSlotsWithOutbox(params: {
    readonly trainerId: string;
    readonly fromIndex: number;
    readonly toIndex: number;
    readonly outboxEvent: SlotOutboxEventInput;
  }): Promise<PersistedPokedexSlot[]> {
    return this.prisma.$transaction(async (tx) => {
      const pair = await tx.pokedexSlot.findMany({
        where: {
          trainerId: params.trainerId,
          slotIndex: { in: [params.fromIndex, params.toIndex] },
        },
        orderBy: { slotIndex: 'asc' },
        select: POKEDEX_SLOT_SELECT,
      });

      if (pair.length === 0) {
        return tx.pokedexSlot.findMany({
          where: { trainerId: params.trainerId },
          orderBy: { slotIndex: 'asc' },
          take: TOTAL_POKEDEX_SLOTS,
          select: POKEDEX_SLOT_SELECT,
        });
      }

      await tx.pokedexSlot.deleteMany({
        where: {
          trainerId: params.trainerId,
          slotIndex: { in: [params.fromIndex, params.toIndex] },
        },
      });

      await Promise.all(
        pair.map((row) => {
          const targetIndex =
            row.slotIndex === params.fromIndex
              ? params.toIndex
              : params.fromIndex;
          return tx.pokedexSlot.create({
            data: {
              trainerId: params.trainerId,
              slotIndex: targetIndex,
              pokemonId: row.pokemonId,
              pokemonName: row.pokemonName,
              nickname: row.nickname,
              spriteUrl: row.spriteUrl,
            },
          });
        }),
      );

      await this.enqueueSlotOutboxEvent(tx, params.outboxEvent);

      return tx.pokedexSlot.findMany({
        where: { trainerId: params.trainerId },
        orderBy: { slotIndex: 'asc' },
        take: TOTAL_POKEDEX_SLOTS,
        select: POKEDEX_SLOT_SELECT,
      });
    });
  }

  private enqueueSlotOutboxEvent(
    tx: Prisma.TransactionClient,
    outboxEvent: SlotOutboxEventInput,
  ): Promise<unknown> {
    return tx.outboxEvent.create({
      data: {
        id: outboxEvent.id,
        aggregateType: POKEDEX_SLOT_AGGREGATE_TYPE,
        aggregateId: outboxEvent.aggregateId,
        eventType: outboxEvent.eventType,
        payload: outboxEvent.payload,
        status: OutboxStatus.PENDING,
      },
    });
  }
}
