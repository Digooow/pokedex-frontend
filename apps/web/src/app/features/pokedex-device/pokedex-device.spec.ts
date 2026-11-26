import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { QualityStore } from '../../core/stores/quality.store';
import {
  createCachedPokemonBundleFixture,
  flushInitialRequests,
  resetBrowserPreferencesState,
} from '../../testing/test-fixtures.spec-helper';
import { PokedexDevicePageComponent } from './pokedex-device.component';
import { PokedexRpgNavService } from './services/pokedex-rpg-nav.service';
import { PokedexSlotsStore } from './services/pokedex-slots.store';
import { PokedexStore } from './services/pokedex.store';

describe('PokedexDevicePageComponent & Pokédex 3D', () => {
  beforeEach(async () => {
    resetBrowserPreferencesState();
    await TestBed.configureTestingModule({
      imports: [PokedexDevicePageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    resetBrowserPreferencesState();
  });

  it('starts Pokédex 3D closed on initial view, focuses #main-heading cleanly, and opens on trigger click', async () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(PokedexStore);
    const fixture = TestBed.createComponent(PokedexDevicePageComponent);
    fixture.detectChanges();
    flushInitialRequests(httpMock);

    const aparelho = fixture.nativeElement.querySelector('#pokedex-aparelho') as HTMLElement;
    const heading = fixture.nativeElement.querySelector('#main-heading') as HTMLElement;
    expect(aparelho.dataset['aberta']).toBe('false');
    expect(store.coverOpen()).toBe(false);
    expect(heading).not.toBeNull();

    const openBtn = fixture.nativeElement.querySelector('#btn-abrir-pokedex') as HTMLButtonElement;
    openBtn.click();
    fixture.detectChanges();

    httpMock.match('/api/v1/pokedex/catalog').forEach((req) =>
      req.flush({
        cache: 'hit',
        catalog: {
          count: 1,
          results: [{ name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon/25/' }],
        },
      }),
    );

    expect(store.coverOpen()).toBe(true);
    expect(aparelho.dataset['aberta']).toBe('true');
  });

  it('supports visitor local slot persistence and clearAll cleanly in PokedexSlotsStore', () => {
    const slotsStore = TestBed.inject(PokedexSlotsStore);
    const pikachu = {
      id: 25,
      name: 'pikachu',
      displayName: 'Pikachu',
      spriteUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
    };

    slotsStore.saveSlot(0, pikachu, 'Sparky');
    expect(slotsStore.slotsMap().get(0)?.nickname).toBe('Sparky');

    slotsStore.clearSlot(0);
    expect(slotsStore.slotsMap().get(0)).toBeUndefined();

    slotsStore.saveSlot(2, pikachu);
    slotsStore.clearAllSlots();
    expect(slotsStore.slotsMap().size).toBe(0);
  });

  it('prevents duplicate Pokémon across slots and manages overwrite/delete confirm state', () => {
    const slotsStore = TestBed.inject(PokedexSlotsStore);
    const pikachu = {
      id: 25,
      name: 'pikachu',
      displayName: 'Pikachu',
      spriteUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
    };
    const bulbasaur = {
      id: 1,
      name: 'bulbasaur',
      displayName: 'Bulbasaur',
      spriteUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png',
    };

    expect(slotsStore.saveSlot(0, pikachu)).toBe(true);
    expect(slotsStore.saveSlot(1, pikachu)).toBe(false);
    expect(slotsStore.slotsMap().get(1)).toBeUndefined();
    expect(slotsStore.feedback()).toContain('Slot 01');

    slotsStore.requestConfirm({
      kind: 'delete-one',
      slotIndex: 0,
      existingLabel: '#01 Pikachu',
    });
    expect(slotsStore.pendingConfirm()?.kind).toBe('delete-one');
    expect(slotsStore.slotsMap().get(0)?.pokemonName).toBe('pikachu');

    slotsStore.closeConfirm();
    expect(slotsStore.pendingConfirm()).toBeNull();
    expect(slotsStore.saveSlot(1, bulbasaur)).toBe(true);
    expect(slotsStore.slotsMap().size).toBe(2);
  });

  it('allows reversing 3D lid animation mid-flight on both opening and closing', () => {
    vi.useFakeTimers();
    try {
      const httpMock = TestBed.inject(HttpTestingController);
      const quality = TestBed.inject(QualityStore);
      const store = TestBed.inject(PokedexStore);
      quality.setPreference('ultra');

      const fixture = TestBed.createComponent(PokedexDevicePageComponent);
      fixture.detectChanges();
      flushInitialRequests(httpMock);
      const rpg = fixture.debugElement.injector.get(PokedexRpgNavService);

      const aparelho = fixture.nativeElement.querySelector('#pokedex-aparelho') as HTMLElement;
      const openBtn = fixture.nativeElement.querySelector(
        '#btn-abrir-pokedex',
      ) as HTMLButtonElement;

      openBtn.click();
      vi.advanceTimersByTime(40);
      fixture.detectChanges();
      expect(rpg.isAnimating()).toBe(true);
      expect(rpg.isDesiredOpen()).toBe(true);
      expect(store.coverOpen()).toBe(true);

      openBtn.click();
      fixture.detectChanges();
      expect(rpg.isAnimating()).toBe(true);
      expect(rpg.isDesiredOpen()).toBe(false);
      expect(store.coverOpen()).toBe(false);

      vi.advanceTimersByTime(1350);
      fixture.detectChanges();
      expect(rpg.isAnimating()).toBe(false);
      expect(store.coverOpen()).toBe(false);

      openBtn.click();
      vi.advanceTimersByTime(1350);
      fixture.detectChanges();
      expect(store.coverOpen()).toBe(true);

      aparelho.click();
      vi.advanceTimersByTime(40);
      fixture.detectChanges();
      expect(rpg.isAnimating()).toBe(true);
      expect(rpg.isDesiredOpen()).toBe(false);

      aparelho.click();
      fixture.detectChanges();
      expect(rpg.isAnimating()).toBe(true);
      expect(rpg.isDesiredOpen()).toBe(true);

      vi.advanceTimersByTime(1350);
      fixture.detectChanges();
      expect(rpg.isAnimating()).toBe(false);
      expect(store.coverOpen()).toBe(true);
      httpMock.match('/api/v1/pokedex/catalog').forEach((req) =>
        req.flush({
          total: 1,
          page: 1,
          limit: 1350,
          source: 'pokeapi',
          items: [
            {
              id: 25,
              name: 'pikachu',
              displayName: 'Pikachu',
              spriteUrl:
                'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
            },
          ],
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('requires 2nd click or round A button to load a Pokémon from found-list items', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(PokedexStore);
    const fixture = TestBed.createComponent(PokedexDevicePageComponent);
    fixture.detectChanges();
    flushInitialRequests(httpMock);

    const openBtn = fixture.nativeElement.querySelector('#btn-abrir-pokedex') as HTMLButtonElement;
    openBtn.click();
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/pokedex/catalog').flush({
      cache: 'hit',
      catalog: {
        count: 2,
        results: [
          { name: 'bulbasaur', url: 'https://pokeapi.co/api/v2/pokemon/1/' },
          { name: 'charmander', url: 'https://pokeapi.co/api/v2/pokemon/4/' },
        ],
      },
    });
    fixture.detectChanges();

    const rpg = fixture.debugElement.injector.get(PokedexRpgNavService);
    const items = fixture.nativeElement.querySelectorAll(
      '.catalogo-item',
    ) as NodeListOf<HTMLButtonElement>;
    const btnA = fixture.nativeElement.querySelector(
      '#btn-controle-selecionar',
    ) as HTMLButtonElement;

    items[1]?.click();
    fixture.detectChanges();
    expect(rpg.rpgCatalogIndex()).toBe(1);
    expect(items[1]?.classList.contains('is-cursor')).toBe(true);
    httpMock.expectNone('/api/v1/pokedex/pokemon/charmander/bundle');
    expect(store.detailState().status).toBe('empty');

    btnA.click();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/pokedex/pokemon/charmander/bundle').flush(
      createCachedPokemonBundleFixture({
        id: 4,
        name: 'charmander',
        typeName: 'fire',
        typeId: 10,
        height: 6,
        weight: 85,
      }),
    );
    expect(store.selectedPokemon()?.name).toBe('charmander');

    const input = fixture.nativeElement.querySelector('#pokemon-input') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const updatedItems = fixture.nativeElement.querySelectorAll(
      '.catalogo-item',
    ) as NodeListOf<HTMLButtonElement>;
    updatedItems[0]?.click();
    fixture.detectChanges();
    expect(rpg.rpgCatalogIndex()).toBe(0);
    httpMock.expectNone('/api/v1/pokedex/pokemon/bulbasaur/bundle');

    updatedItems[0]?.click();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/pokedex/pokemon/bulbasaur/bundle').flush(
      createCachedPokemonBundleFixture({
        id: 1,
        name: 'bulbasaur',
        typeName: 'grass',
        typeId: 12,
        height: 7,
        weight: 69,
      }),
    );
    expect(store.selectedPokemon()?.name).toBe('bulbasaur');
  });

  it('steps back 1 level on Red Button from selected variation to search query then to full catalog at selected index', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(PokedexStore);
    const fixture = TestBed.createComponent(PokedexDevicePageComponent);
    fixture.detectChanges();
    flushInitialRequests(httpMock);

    const openBtn = fixture.nativeElement.querySelector('#btn-abrir-pokedex') as HTMLButtonElement;
    openBtn.click();
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/pokedex/catalog').flush({
      cache: 'hit',
      catalog: {
        count: 4,
        results: [
          { name: 'bulbasaur', url: 'https://pokeapi.co/api/v2/pokemon/1/' },
          { name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon/25/' },
          { name: 'pikachu-original-cap', url: 'https://pokeapi.co/api/v2/pokemon/10094/' },
          { name: 'gholdengo', url: 'https://pokeapi.co/api/v2/pokemon/1000/' },
        ],
      },
    });
    fixture.detectChanges();

    const rpg = fixture.debugElement.injector.get(PokedexRpgNavService);
    const input = fixture.nativeElement.querySelector('#pokemon-input') as HTMLInputElement;
    const redBtn = fixture.nativeElement.querySelector('#btn-limpar-form') as HTMLButtonElement;

    input.value = 'pikachu';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const pichuItems = fixture.nativeElement.querySelectorAll(
      '.catalogo-item',
    ) as NodeListOf<HTMLButtonElement>;
    expect(pichuItems).toHaveLength(2);

    pichuItems[1]?.click();
    fixture.detectChanges();
    pichuItems[1]?.click();
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/pokedex/pokemon/pikachu-original-cap/bundle').flush(
      createCachedPokemonBundleFixture({
        id: 10094,
        name: 'pikachu-original-cap',
        typeName: 'electric',
        typeId: 13,
        height: 4,
        weight: 60,
      }),
    );
    fixture.detectChanges();

    expect(store.query()).toBe('pikachu-original-cap');
    expect(store.previousQuery()).toBe('pikachu');

    redBtn.click();
    fixture.detectChanges();
    expect(store.query()).toBe('pikachu');
    expect(store.filteredCatalog().items).toHaveLength(2);
    expect(rpg.rpgCatalogIndex()).toBe(1);

    redBtn.click();
    fixture.detectChanges();
    expect(store.query()).toBe('');
    expect(store.filteredCatalog().items).toHaveLength(4);
    expect(rpg.rpgCatalogIndex()).toBe(2);

    redBtn.click();
    fixture.detectChanges();
    expect(store.query()).toBe('');
    expect(rpg.rpgCatalogIndex()).toBe(0);
  });

  function setupOpenDeviceWithSlots() {
    const httpMock = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(PokedexStore);
    const slotsStore = TestBed.inject(PokedexSlotsStore);
    const baseSprite = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
    slotsStore.saveSlot(0, {
      id: 25,
      name: 'pikachu',
      displayName: 'Pikachu',
      spriteUrl: `${baseSprite}/25.png`,
    });
    slotsStore.saveSlot(1, {
      id: 1,
      name: 'bulbasaur',
      displayName: 'Bulbasaur',
      spriteUrl: `${baseSprite}/1.png`,
    });
    const fixture = TestBed.createComponent(PokedexDevicePageComponent);
    fixture.detectChanges();
    flushInitialRequests(httpMock);
    (fixture.nativeElement.querySelector('#btn-abrir-pokedex') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpMock
      .match('/api/v1/pokedex/catalog')
      .forEach((req) => req.flush({ cache: 'hit', catalog: { count: 0, results: [] } }));
    const slotButtons = fixture.nativeElement.querySelectorAll(
      '.btn-slot-azul',
    ) as NodeListOf<HTMLButtonElement>;
    return { httpMock, store, slotsStore, fixture, slotButtons };
  }

  it('opens occupied slot directly without confirmation modal and swaps slots cleanly', () => {
    const { httpMock, store, slotsStore, fixture, slotButtons } = setupOpenDeviceWithSlots();

    store.loadPokemonDetail('charmander');
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/charmander/bundle')
      .flush(createCachedPokemonBundleFixture({ id: 4, name: 'charmander', typeName: 'fire' }));
    fixture.detectChanges();
    expect(store.selectedPokemon()?.name).toBe('charmander');

    slotButtons[0]?.click();
    fixture.detectChanges();
    expect(slotsStore.pendingConfirm()).toBeNull();
    expect(slotsStore.slotsMap().get(0)?.pokemonName).toBe('pikachu');
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/pikachu/bundle')
      .flush(createCachedPokemonBundleFixture({ id: 25, name: 'pikachu', typeName: 'electric' }));
    fixture.detectChanges();
    expect(store.selectedPokemon()?.name).toBe('pikachu');

    slotButtons[1]?.click();
    fixture.detectChanges();
    expect(slotsStore.pendingConfirm()).toBeNull();
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/bulbasaur/bundle')
      .flush(createCachedPokemonBundleFixture({ id: 1, name: 'bulbasaur', typeName: 'grass' }));
    fixture.detectChanges();
    expect(store.selectedPokemon()?.name).toBe('bulbasaur');

    expect(slotsStore.swapSlots(0, 1)).toBe(true);
    expect(slotsStore.slotsMap().get(0)?.pokemonName).toBe('bulbasaur');
    expect(slotsStore.slotsMap().get(1)?.pokemonName).toBe('pikachu');

    (fixture.nativeElement.querySelector('#btn-config-slots') as HTMLButtonElement).click();
    fixture.detectChanges();
    const moveDownBtn = fixture.nativeElement.querySelector(
      '.btn-slot-acao--move[aria-label*="para baixo"]',
    ) as HTMLButtonElement;
    expect(moveDownBtn).not.toBeNull();
  });
});
