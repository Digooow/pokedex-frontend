import { describe, expect, it } from 'vitest';
import { PLATFORM_MODULES } from '../constants/platform.constants';
import { ReadinessResponseSchema, SystemBootstrapSchema } from './health.schemas';
import { PokemonDetailSchema, SavePokedexSlotSchema } from './pokedex.schemas';

describe('shared schemas boundary validation', () => {
  it('validates strict SavePokedexSlotSchema bounds', () => {
    const valid = SavePokedexSlotSchema.safeParse({
      slotIndex: 0,
      pokemonId: 25,
      pokemonName: 'pikachu',
      nickname: 'Sparky',
    });
    expect(valid.success).toBe(true);

    const outOfRange = SavePokedexSlotSchema.safeParse({
      slotIndex: 10,
      pokemonId: 0,
      pokemonName: '',
    });
    expect(outOfRange.success).toBe(false);

    const extraField = SavePokedexSlotSchema.safeParse({
      slotIndex: 1,
      pokemonId: 1,
      pokemonName: 'bulbasaur',
      evilOverride: true,
    });
    expect(extraField.success).toBe(false);
  });

  it('validates readiness and bootstrap contracts', () => {
    const ready = ReadinessResponseSchema.safeParse({
      status: 'ok',
      service: 'pokeverse-api',
      timestamp: new Date().toISOString(),
      uptimeSec: 1.5,
      dependencies: {
        postgres: { status: 'up', latencyMs: 3 },
        redis: { status: 'up', latencyMs: 1 },
        kafka: { status: 'up', latencyMs: 12 },
        s3: { status: 'up', latencyMs: 5 },
      },
    });
    expect(ready.success).toBe(true);

    const bootstrap = SystemBootstrapSchema.safeParse({
      service: 'pokeverse-api',
      phase: 'phase-1',
      timestamp: new Date().toISOString(),
      modules: [...PLATFORM_MODULES],
    });
    expect(bootstrap.success).toBe(true);
  });

  it('accepts sparse PokéAPI detail payloads safely', () => {
    const parsed = PokemonDetailSchema.safeParse({
      id: 25,
      name: 'pikachu',
      height: 4,
      weight: 60,
      base_experience: null,
      types: [{ slot: 1, type: { name: 'electric', url: 'https://pokeapi.co/api/v2/type/13/' } }],
      abilities: [],
      stats: [],
      sprites: { front_default: null, front_shiny: null },
    });
    expect(parsed.success).toBe(true);
  });
});
