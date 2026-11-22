import { BadRequestException, ConflictException } from '@nestjs/common';
import { KAFKA_TOPICS } from '@pokeverse/shared';
import type { PokedexSlotRepository } from './pokedex-slot.repository';
import { PokedexSlotsService } from './pokedex-slots.service';

describe('PokedexSlotsService (domain orchestration over PokedexSlotRepository)', () => {
  const trainerId = '550e8400-e29b-41d4-a716-446655440000';

  it('lists saved trainer slots normalized as ISO datetimes', async () => {
    const now = new Date('2026-11-20T10:00:00.000Z');
    const repositoryMock = {
      findByTrainerId: jest.fn().mockResolvedValue([
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
    } as unknown as PokedexSlotRepository;

    const service = new PokedexSlotsService(repositoryMock);
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

  it('rejects mismatched slotIndex and duplicate Pokemon while emitting validated Outbox payload on save', async () => {
    const upsertSlotWithOutbox = jest.fn();
    const repositoryMock = {
      upsertSlotWithOutbox,
    } as unknown as PokedexSlotRepository;

    const service = new PokedexSlotsService(repositoryMock);

    await expect(
      service.upsertSlot(
        trainerId,
        'Red_Kanto',
        1,
        { slotIndex: 2, pokemonId: 25, pokemonName: 'pikachu' },
        null,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(upsertSlotWithOutbox).not.toHaveBeenCalled();

    upsertSlotWithOutbox.mockResolvedValueOnce({
      status: 'duplicate',
      existingSlotIndex: 0,
    });
    await expect(
      service.upsertSlot(
        trainerId,
        'Red_Kanto',
        2,
        { slotIndex: 2, pokemonId: 25, pokemonName: 'pikachu' },
        null,
      ),
    ).rejects.toThrow(ConflictException);

    const updatedAt = new Date('2026-11-21T12:00:00.000Z');
    upsertSlotWithOutbox.mockResolvedValueOnce({
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

    const saved = await service.upsertSlot(
      trainerId,
      'Red_Kanto',
      2,
      { slotIndex: 2, pokemonId: 25, pokemonName: 'pikachu', nickname: 'Bolt' },
      '0123456789abcdef0123456789abcdef',
    );

    expect(saved.slotIndex).toBe(2);
    expect(saved.nickname).toBe('Bolt');
    expect(upsertSlotWithOutbox).toHaveBeenLastCalledWith({
      trainerId,
      slotIndex: 2,
      input: {
        slotIndex: 2,
        pokemonId: 25,
        pokemonName: 'pikachu',
        nickname: 'Bolt',
      },
      outboxEvent: {
        id: expect.any(String) as string,
        aggregateId: `${trainerId}:2`,
        eventType: KAFKA_TOPICS.WORLD_EVENTS,
        payload: expect.objectContaining({
          eventType: 'pokedex.slot.saved',
          trainerId,
          username: 'Red_Kanto',
          traceId: '0123456789abcdef0123456789abcdef',
        }) as unknown,
      },
    });
  });

  it('delegates slot clearing with validated Outbox events', async () => {
    const deleteSlotWithOutbox = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const deleteAllSlotsWithOutbox = jest.fn().mockResolvedValueOnce(3);
    const repositoryMock = {
      deleteSlotWithOutbox,
      deleteAllSlotsWithOutbox,
    } as unknown as PokedexSlotRepository;

    const service = new PokedexSlotsService(repositoryMock);

    expect(await service.clearSlot(trainerId, 'Red_Kanto', 1, null)).toBe(
      false,
    );
    expect(await service.clearSlot(trainerId, 'Red_Kanto', 1, null)).toBe(true);
    expect(deleteSlotWithOutbox).toHaveBeenLastCalledWith(trainerId, 1, {
      id: expect.any(String) as string,
      aggregateId: `${trainerId}:1`,
      eventType: KAFKA_TOPICS.WORLD_EVENTS,
      payload: expect.objectContaining({
        eventType: 'pokedex.slot.cleared',
        trainerId,
      }) as unknown,
    });

    expect(await service.clearAllSlots(trainerId, 'Red_Kanto', null)).toBe(3);
    expect(deleteAllSlotsWithOutbox).toHaveBeenCalledWith(trainerId, {
      id: expect.any(String) as string,
      aggregateId: `${trainerId}:all`,
      eventType: KAFKA_TOPICS.WORLD_EVENTS,
      payload: expect.objectContaining({
        eventType: 'pokedex.slot.cleared',
        trainerId,
      }) as unknown,
    });
  });
});
