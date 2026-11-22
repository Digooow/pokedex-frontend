import { ConflictException } from '@nestjs/common';
import { KAFKA_TOPICS } from '@pokeverse/shared';
import type { PrismaService } from '../../infra/prisma.service';
import { PokedexSlotsService } from './pokedex-slots.service';

describe('PokedexSlotsService (ACID 10-slot uniqueness & Outbox events)', () => {
  const trainerId = '550e8400-e29b-41d4-a716-446655440000';

  it('lists saved trainer slots normalized as ISO datetimes', async () => {
    const now = new Date('2026-11-20T10:00:00.000Z');
    const prismaMock = {
      pokedexSlot: {
        findMany: jest.fn().mockResolvedValue([
          {
            slotIndex: 0,
            pokemonId: 25,
            pokemonName: 'pikachu',
            nickname: 'Sparky',
            spriteUrl:
              'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
            updatedAt: now,
          },
        ]),
      },
    } as unknown as PrismaService;

    const service = new PokedexSlotsService(prismaMock);
    const slots = await service.listSlots(trainerId);

    expect(slots).toHaveLength(1);
    expect(slots[0]).toEqual({
      slotIndex: 0,
      pokemonId: 25,
      pokemonName: 'pikachu',
      nickname: 'Sparky',
      spriteUrl:
        'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
      updatedAt: '2026-11-20T10:00:00.000Z',
    });
  });

  it('rejects duplicate Pokémon in another slot with 409 Conflict and emits Outbox event on save', async () => {
    const findFirst = jest.fn();
    const upsert = jest.fn();
    const outboxCreate = jest.fn().mockResolvedValue({ id: 'ev-1' });

    const txMock = {
      pokedexSlot: { findFirst, upsert },
      outboxEvent: { create: outboxCreate },
    };
    const prismaMock = {
      $transaction: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) =>
        fn(txMock),
      ),
    } as unknown as PrismaService;

    const service = new PokedexSlotsService(prismaMock);

    findFirst.mockResolvedValueOnce({ slotIndex: 0 });
    await expect(
      service.upsertSlot(
        trainerId,
        'Red_Kanto',
        2,
        { slotIndex: 2, pokemonId: 25, pokemonName: 'pikachu' },
        null,
      ),
    ).rejects.toThrow(ConflictException);
    expect(upsert).not.toHaveBeenCalled();

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

    const saved = await service.upsertSlot(
      trainerId,
      'Red_Kanto',
      2,
      { slotIndex: 2, pokemonId: 25, pokemonName: 'pikachu', nickname: 'Bolt' },
      '0123456789abcdef0123456789abcdef',
    );

    expect(saved.slotIndex).toBe(2);
    expect(saved.nickname).toBe('Bolt');
    expect(outboxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        aggregateType: 'PokedexSlot',
        aggregateId: `${trainerId}:2`,
        eventType: KAFKA_TOPICS.WORLD_EVENTS,
        status: 'PENDING',
      }) as unknown,
    });
  });

  it('clears individual and all slots while emitting Outbox events only when rows existed', async () => {
    const deleteMany = jest.fn();
    const outboxCreate = jest.fn().mockResolvedValue({ id: 'ev-2' });

    const txMock = {
      pokedexSlot: { deleteMany },
      outboxEvent: { create: outboxCreate },
    };
    const prismaMock = {
      $transaction: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) =>
        fn(txMock),
      ),
    } as unknown as PrismaService;

    const service = new PokedexSlotsService(prismaMock);

    deleteMany.mockResolvedValueOnce({ count: 0 });
    expect(await service.clearSlot(trainerId, 'Red_Kanto', 1, null)).toBe(
      false,
    );
    expect(outboxCreate).not.toHaveBeenCalled();

    deleteMany.mockResolvedValueOnce({ count: 1 });
    expect(await service.clearSlot(trainerId, 'Red_Kanto', 1, null)).toBe(true);
    expect(outboxCreate).toHaveBeenCalledTimes(1);

    deleteMany.mockResolvedValueOnce({ count: 3 });
    expect(await service.clearAllSlots(trainerId, 'Red_Kanto', null)).toBe(3);
    expect(outboxCreate).toHaveBeenCalledTimes(2);
  });
});
