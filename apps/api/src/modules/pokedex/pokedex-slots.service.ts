import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  KAFKA_TOPICS,
  type PokedexSlotRecord,
  PokedexSlotRecordSchema,
  type SavePokedexSlotInput,
  type SwapPokedexSlotsInput,
  type WorldEventType,
  WorldTickerEventSchema,
  formatPokeApiText,
} from '@pokeverse/shared';
import {
  type PersistedPokedexSlot,
  PokedexSlotRepository,
  type SlotOutboxEventInput,
} from './pokedex-slot.repository';

@Injectable()
export class PokedexSlotsService {
  constructor(private readonly slotRepository: PokedexSlotRepository) {}

  async listSlots(trainerId: string): Promise<PokedexSlotRecord[]> {
    const rows = await this.slotRepository.findByTrainerId(trainerId);
    return rows.map((row) => this.toSlotRecord(row));
  }

  async upsertSlot(
    trainerId: string,
    username: string,
    slotIndex: number,
    input: SavePokedexSlotInput,
    traceId: string | null,
  ): Promise<PokedexSlotRecord> {
    if (input.slotIndex !== slotIndex) {
      throw new BadRequestException(
        'O slotIndex do corpo deve corresponder ao parâmetro da URL.',
      );
    }

    const displayPokemon = formatPokeApiText(input.pokemonName);
    const paddedId = `#${String(input.pokemonId).padStart(4, '0')}`;
    const outboxEvent = this.buildTickerOutboxEvent({
      eventType: 'pokedex.slot.saved',
      trainerId,
      username,
      aggregateId: `${trainerId}:${slotIndex}`,
      summary: `${username} gravou ${displayPokemon} (${paddedId}) no Slot ${slotIndex + 1}.`,
      traceId,
    });

    const result = await this.slotRepository.upsertSlotWithOutbox({
      trainerId,
      slotIndex,
      input,
      outboxEvent,
    });

    if (result.status === 'duplicate') {
      throw new ConflictException(
        'Este Pokémon já está registrado em outro slot da Pokédex.',
      );
    }

    return this.toSlotRecord(result.slot);
  }

  clearSlot(
    trainerId: string,
    username: string,
    slotIndex: number,
    traceId: string | null,
  ): Promise<boolean> {
    const outboxEvent = this.buildTickerOutboxEvent({
      eventType: 'pokedex.slot.cleared',
      trainerId,
      username,
      aggregateId: `${trainerId}:${slotIndex}`,
      summary: `${username} liberou o Slot ${slotIndex + 1} da Pokédex.`,
      traceId,
    });

    return this.slotRepository.deleteSlotWithOutbox(
      trainerId,
      slotIndex,
      outboxEvent,
    );
  }

  clearAllSlots(
    trainerId: string,
    username: string,
    traceId: string | null,
  ): Promise<number> {
    const outboxEvent = this.buildTickerOutboxEvent({
      eventType: 'pokedex.slot.cleared',
      trainerId,
      username,
      aggregateId: `${trainerId}:all`,
      summary: `${username} liberou todos os slots salvos da Pokédex.`,
      traceId,
    });

    return this.slotRepository.deleteAllSlotsWithOutbox(trainerId, outboxEvent);
  }

  async swapSlots(
    trainerId: string,
    username: string,
    input: SwapPokedexSlotsInput,
    traceId: string | null,
  ): Promise<PokedexSlotRecord[]> {
    const outboxEvent = this.buildTickerOutboxEvent({
      eventType: 'pokedex.slot.saved',
      trainerId,
      username,
      aggregateId: `${trainerId}:${input.fromIndex}:${input.toIndex}`,
      summary: `${username} reorganizou os slots ${input.fromIndex + 1} e ${input.toIndex + 1} da Pokédex.`,
      traceId,
    });

    const rows = await this.slotRepository.swapSlotsWithOutbox({
      trainerId,
      fromIndex: input.fromIndex,
      toIndex: input.toIndex,
      outboxEvent,
    });

    return rows.map((row) => this.toSlotRecord(row));
  }

  private buildTickerOutboxEvent(params: {
    readonly eventType: WorldEventType;
    readonly trainerId: string;
    readonly username: string;
    readonly aggregateId: string;
    readonly summary: string;
    readonly traceId: string | null;
  }): SlotOutboxEventInput {
    const eventId = randomUUID();
    const tickerEvent = WorldTickerEventSchema.parse({
      eventId,
      eventType: params.eventType,
      trainerId: params.trainerId,
      username: params.username,
      summary: params.summary,
      occurredAt: new Date().toISOString(),
      traceId: params.traceId,
    });

    return {
      id: eventId,
      aggregateId: params.aggregateId,
      eventType: KAFKA_TOPICS.WORLD_EVENTS,
      payload: tickerEvent,
    };
  }

  private toSlotRecord(row: PersistedPokedexSlot): PokedexSlotRecord {
    return PokedexSlotRecordSchema.parse({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
    });
  }
}
