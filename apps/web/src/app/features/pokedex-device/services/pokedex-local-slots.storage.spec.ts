import { TestBed } from '@angular/core/testing';
import { PrivacyConsentStore } from '../../../core/stores/privacy-consent.store';
import { PokedexLocalSlotsStorage, buildLocalSlotRecord } from './pokedex-local-slots.storage';

describe('PokedexLocalSlotsStorage', () => {
  beforeEach(() => {
    window.localStorage.removeItem('pokedex_slots_salvos');
    document.cookie = 'pokeverse_consent=; Path=/; Max-Age=0';
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    window.localStorage.removeItem('pokedex_slots_salvos');
    document.cookie = 'pokeverse_consent=; Path=/; Max-Age=0';
  });

  it('loads legacy localStorage array deduplicating repeated Pokemon across slots', () => {
    window.localStorage.setItem(
      'pokedex_slots_salvos',
      JSON.stringify([
        { name: 'Pikachu', id: 25, apelido: 'Sparky', spriteUrl: 'https://img/25.png' },
        { name: 'pikachu', id: 25, apelido: 'Duplicado' },
        { pokemonName: 'bulbasaur', pokemonId: 1, nickname: '  Bulba  ' },
      ]),
    );

    const storage = TestBed.inject(PokedexLocalSlotsStorage);
    const loaded = storage.load();

    expect(loaded.size).toBe(2);
    expect(loaded.get(0)).toMatchObject({
      slotIndex: 0,
      pokemonId: 25,
      pokemonName: 'pikachu',
      nickname: 'Sparky',
    });
    expect(loaded.get(2)).toMatchObject({
      slotIndex: 2,
      pokemonId: 1,
      pokemonName: 'bulbasaur',
      nickname: 'Bulba',
    });
  });

  it('blocks localStorage persistence when user declined optional functional cookies', () => {
    const privacy = TestBed.inject(PrivacyConsentStore);
    const storage = TestBed.inject(PokedexLocalSlotsStorage);

    privacy.acceptEssentialOnly();
    const slots = new Map([[0, buildLocalSlotRecord({ slotIndex: 0, pokemonId: 25, pokemonName: 'pikachu' })]]);
    storage.persist(slots);

    expect(window.localStorage.getItem('pokedex_slots_salvos')).toBeNull();
    expect(storage.load().size).toBe(0);
  });

  it('persists slots and tolerates corrupted JSON gracefully', () => {
    const storage = TestBed.inject(PokedexLocalSlotsStorage);
    const record = buildLocalSlotRecord({
      slotIndex: 1,
      pokemonId: 4,
      pokemonName: 'Charmander',
      nickname: 'Chama',
    });

    storage.persist(new Map([[1, record]]));
    expect(storage.load().get(1)).toMatchObject({
      slotIndex: 1,
      pokemonId: 4,
      pokemonName: 'charmander',
      nickname: 'Chama',
    });

    window.localStorage.setItem('pokedex_slots_salvos', '{invalid-json');
    expect(storage.load().size).toBe(0);
  });
});
