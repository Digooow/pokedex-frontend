import { TOTAL_POKEDEX_SLOTS } from '@pokeverse/shared';
import { OutboxStatus } from '@prisma/client';
import type { PrismaService } from '../../infra/prisma.service';
import {
  PokedexSlotRepository,
  type SlotOutboxEventInput,
} from './pokedex-slot.repository';

describe('PokedexSlotRepository (Prisma isolation, take & OutboxStatus)', () => {
  const trainerId = '550e8400-e29b-41d4-a716-446655440000';
  const sampleOutbox: SlotOutboxEventInput = {
    id: '550e8400-e29b-41d4-a716-446655440010',
    aggregateId: `${trainerId}:2`,
    eventType: 'pokeverse.world.events.v1',
    payload: { eventId: '550e8400-e29b-41d4-a716-446655440010' },
  };

  it('queries trainer slots with explicit take and strict select projection', async () => {
    const now = new Date('2026-11-20T10:00:00.000Z');
    const findMany = jest.fn().mockResolvedValue([
      {
        slotIndex: 0,
        pokemonId: 25,
        pokemonName: 'pikachu',
        nickname: 'Sparky',
        spriteUrl: null,
        updatedAt: now,
      },
    ]);
    const prismaMock = {
      pokedexSlot: { findMany },
    } as unknown as PrismaService;

    const repository = new PokedexSlotRepository(prismaMock);
    const rows = await repository.findByTrainerId(trainerId);

    expect(rows).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { trainerId },
      orderBy: { slotIndex: 'asc' },
      take: TOTAL_POKEDEX_SLOTS,
      select: {
        slotIndex: true,
        pokemonId: true,
        pokemonName: true,
        nickname: true,
        spriteUrl: true,
        updatedAt: true,
      },
    });
  });

  it('returns duplicate status without writing when Pokemon exists in another slot and saves with OutboxStatus.PENDING otherwise', async () => {
    const findFirst = jest.fn();
    const upsert = jest.fn();
    const outboxCreate = jest.fn().mockResolvedValue({ id: sampleOutbox.id });

    const txMock = {
      pokedexSlot: { findFirst, upsert },
      outboxEvent: { create: outboxCreate },
    };
    const prismaMock = {
      $transaction: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) =>
        fn(txMock),
      ),
    } as unknown as PrismaService;

    const repository = new PokedexSlotRepository(prismaMock);

    findFirst.mockResolvedValueOnce({ slotIndex: 0 });
    const duplicateResult = await repository.upsertSlotWithOutbox({
      trainerId,
      slotIndex: 2,
      input: { slotIndex: 2, pokemonId: 25, pokemonName: 'pikachu' },
      outboxEvent: sampleOutbox,
    });

    expect(duplicateResult).toEqual({
      status: 'duplicate',
      existingSlotIndex: 0,
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(outboxCreate).not.toHaveBeenCalled();

    const updatedAt = new Date('2026-11-21T12:00:00.000Z');
    findFirst.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({
      slotIndex: 2,
      pokemonId: 25,
      pokemonName: 'pikachu',
      nickname: 'Bolt',
      spriteUrl: null,
      updatedAt,
    });

    const savedResult = await repository.upsertSlotWithOutbox({
      trainerId,
      slotIndex: 2,
      input: {
        slotIndex: 2,
        pokemonId: 25,
        pokemonName: 'pikachu',
        nickname: 'Bolt',
      },
      outboxEvent: sampleOutbox,
    });

    expect(savedResult).toEqual({
      status: 'saved',
      slot: {
        slotIndex: 2,
        pokemonId: 25,
        pokemonName: 'pikachu',
        nickname: 'Bolt',
        spriteUrl: null,
        updatedAt,
      },
    });
    expect(outboxCreate).toHaveBeenCalledWith({
      data: {
        id: sampleOutbox.id,
        aggregateType: 'PokedexSlot',
        aggregateId: sampleOutbox.aggregateId,
        eventType: sampleOutbox.eventType,
        payload: sampleOutbox.payload,
        status: OutboxStatus.PENDING,
      },
    });
  });

  it('enqueues OutboxStatus.PENDING only when slots are actually deleted', async () => {
    const deleteMany = jest.fn();
    const outboxCreate = jest.fn().mockResolvedValue({ id: sampleOutbox.id });

    const txMock = {
      pokedexSlot: { deleteMany },
      outboxEvent: { create: outboxCreate },
    };
    const prismaMock = {
      $transaction: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) =>
        fn(txMock),
      ),
    } as unknown as PrismaService;

    const repository = new PokedexSlotRepository(prismaMock);

    deleteMany.mockResolvedValueOnce({ count: 0 });
    expect(
      await repository.deleteSlotWithOutbox(trainerId, 1, sampleOutbox),
    ).toBe(false);
    expect(outboxCreate).not.toHaveBeenCalled();

    deleteMany.mockResolvedValueOnce({ count: 1 });
    expect(
      await repository.deleteSlotWithOutbox(trainerId, 1, sampleOutbox),
    ).toBe(true);
    expect(outboxCreate).toHaveBeenCalledTimes(1);

    deleteMany.mockResolvedValueOnce({ count: 0 });
    expect(
      await repository.deleteAllSlotsWithOutbox(trainerId, sampleOutbox),
    ).toBe(0);
    expect(outboxCreate).toHaveBeenCalledTimes(1);

    deleteMany.mockResolvedValueOnce({ count: 3 });
    expect(
      await repository.deleteAllSlotsWithOutbox(trainerId, sampleOutbox),
    ).toBe(3);
    expect(outboxCreate).toHaveBeenCalledTimes(2);
  });
});
