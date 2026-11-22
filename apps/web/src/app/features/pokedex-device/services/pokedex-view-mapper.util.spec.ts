import type { PokemonDetailDto } from '@pokeverse/shared';
import {
  buildPokemonFetchErrorMessage,
  mapCatalogEntriesToSearchable,
  mapPokemonDtoToView,
  toResolvedPokemonForSlot,
} from './pokedex-view-mapper.util';

function createSamplePokemonDto(overrides?: Partial<PokemonDetailDto>): PokemonDetailDto {
  return {
    id: 25,
    name: 'pikachu',
    height: 4,
    weight: 60,
    types: [{ slot: 1, type: { name: 'electric', url: 'https://pokeapi.co/api/v2/type/13/' } }],
    abilities: [
      {
        is_hidden: false,
        slot: 1,
        ability: { name: 'static', url: 'https://pokeapi.co/api/v2/ability/9/' },
      },
      {
        is_hidden: true,
        slot: 3,
        ability: { name: 'lightning-rod', url: 'https://pokeapi.co/api/v2/ability/31/' },
      },
    ],
    stats: [
      { base_stat: 35, effort: 0, stat: { name: 'hp', url: 'https://pokeapi.co/api/v2/stat/1/' } },
    ],
    sprites: {
      front_default:
        'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
      other: {
        'official-artwork': {
          front_default:
            'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',
        },
      },
    },
    ...overrides,
  };
}

describe('pokedex-view-mapper.util', () => {
  it('maps catalog entries filtering invalid URLs without numeric IDs', () => {
    const items = mapCatalogEntriesToSearchable({
      count: 2,
      results: [
        { name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon/25/' },
        { name: 'invalid-entry', url: 'https://pokeapi.co/api/v2/pokemon/' },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 25, name: 'pikachu', displayName: 'Pikachu' });
  });

  it('maps Pokemon DTO to ViewModel with official artwork, pt-BR units and hidden ability marker', () => {
    const vm = mapPokemonDtoToView(createSamplePokemonDto());

    expect(vm.paddedId).toBe('#0025');
    expect(vm.displayName).toBe('Pikachu');
    expect(vm.heightMeters).toBe('0,4 m');
    expect(vm.weightKg).toBe('6,0 kg');
    expect(vm.spriteUrl).toContain('official-artwork/25.png');
    expect(vm.fallbackSpriteUrl).toContain('pokemon/25.png');
    expect(vm.abilities).toEqual(['Static', 'Lightning Rod (oculta)']);
    expect(vm.stats).toEqual([{ label: 'Hp', value: 35 }]);
  });

  it('falls back to front_default when official artwork is absent and projects slot summary', () => {
    const dto = createSamplePokemonDto({
      sprites: {
        front_default:
          'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
        other: { 'official-artwork': { front_default: null } },
      },
    });

    expect(toResolvedPokemonForSlot(dto)).toEqual({
      id: 25,
      name: 'pikachu',
      displayName: 'Pikachu',
      spriteUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
    });
  });

  it('builds distinct user-friendly messages for 404, HTTP error and timeout', () => {
    expect(
      buildPokemonFetchErrorMessage('missingno', { found: false, notFound: true, statusCode: 404 }),
    ).toContain('"missingno"');
    expect(
      buildPokemonFetchErrorMessage('pikachu', { found: false, notFound: false, statusCode: 503 }),
    ).toContain('HTTP 503');
    expect(
      buildPokemonFetchErrorMessage('pikachu', { found: false, notFound: false, statusCode: null }),
    ).toContain('não respondeu a tempo');
  });
});
