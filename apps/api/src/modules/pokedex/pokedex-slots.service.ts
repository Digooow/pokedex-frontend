import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  KAFKA_TOPICS,
  type PokedexSlotRecord,
  PokedexSlotRecordSchema,
  type SavePokedexSlotInput,
  WorldTickerEventSchema,
  formatPokeApiText,
} from '@pokeverse/shared';
import { PrismaService } from '../../infra/prisma.service';

const SLOT_SELECT = {
  slotIndex: true,
  pokemonId: true,
  pokemonName: true,
  nickname: true,
  spriteUrl: true,
  updatedAt: true,
} as const;

@Injectable()
export class PokedexSlotsService {
  constructor(private readonly prisma: PrismaService) {}

  async listSlots(trainerId: string): Promise<PokedexSlotRecord[]> {
    const rows = await this.prisma.pokedexSlot.findMany({
      where: { trainerId },
      orderBy: { slotIndex: 'asc' },
      select: SLOT_SELECT,
    });

    return rows.map((row) =>
      PokedexSlotRecordSchema.parse({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
      }),
    );
  }

  async upsertSlot(
    trainerId: string,
    username: string,
    slotIndex: number,
    input: SavePokedexSlotInput,
    traceId: string | null,
  ): Promise<PokedexSlotRecord> {
    const saved = await this.prisma.$transaction(async (tx) => {
      const slot = await tx.pokedexSlot.upsert({
        where: {
          trainerId_slotIndex: { trainerId, slotIndex },
        },
        update: {
          pokemonId: input.pokemonId,
          pokemonName: input.pokemonName,
          nickname: input.nickname ?? null,
          spriteUrl: input.spriteUrl ?? null,
        },
        create: {
          trainerId,
          slotIndex,
          pokemonId: input.pokemonId,
          pokemonName: input.pokemonName,
          nickname: input.nickname ?? null,
          spriteUrl: input.spriteUrl ?? null,
        },
        select: SLOT_SELECT,
      });

      const eventId = randomUUID();
      const displayPokemon = formatPokeApiText(input.pokemonName);
      const paddedId = `#${String(input.pokemonId).padStart(4, '0')}`;
      const tickerEvent = WorldTickerEventSchema.parse({
        eventId,
        eventType: 'pokedex.slot.saved',
        trainerId,
        username,
        summary: `${username} gravou ${displayPokemon} (${paddedId}) no Slot ${slotIndex + 1}.`,
        occurredAt: new Date().toISOString(),
        traceId,
      });

      await tx.outboxEvent.create({
        data: {
          id: eventId,
          aggregateType: 'PokedexSlot',
          aggregateId: `${trainerId}:${slotIndex}`,
          eventType: KAFKA_TOPICS.WORLD_EVENTS,
          payload: tickerEvent,
          status: 'PENDING',
        },
      });

      return slot;
    });

    return PokedexSlotRecordSchema.parse({
      ...saved,
      updatedAt: saved.updatedAt.toISOString(),
    });
  }

  clearSlot(
    trainerId: string,
    username: string,
    slotIndex: number,
    traceId: string | null,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.pokedexSlot.deleteMany({
        where: { trainerId, slotIndex },
      });

      if (deleted.count === 0) {
        return false;
      }

      const eventId = randomUUID();
      const tickerEvent = WorldTickerEventSchema.parse({
        eventId,
        eventType: 'pokedex.slot.cleared',
        trainerId,
        username,
        summary: `${username} liberou o Slot ${slotIndex + 1} da Pokédex.`,
        occurredAt: new Date().toISOString(),
        traceId,
      });

      await tx.outboxEvent.create({
        data: {
          id: eventId,
          aggregateType: 'PokedexSlot',
          aggregateId: `${trainerId}:${slotIndex}`,
          eventType: KAFKA_TOPICS.WORLD_EVENTS,
          payload: tickerEvent,
          status: 'PENDING',
        },
      });

      return true;
    });
  }
}
