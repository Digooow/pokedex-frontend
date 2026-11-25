import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  createCachedPokemonBundleFixture,
  flushInitialRequests,
} from '../../testing/test-fixtures.spec-helper';
import {
  createEnrichedCatalogFixture,
  createMetaFiltersFixture,
} from '../../testing/visor-fixtures.spec-helper';
import { PokedexDevicePageComponent } from './pokedex-device.component';
import { PokedexCompareStore } from './services/pokedex-compare.store';
import { PokedexFiltersStore } from './services/pokedex-filters.store';
import { PokedexStore } from './services/pokedex.store';

describe('Pokedex Filters Panel & 1v1 Comparator', () => {
  beforeEach(async () => {
    window.localStorage.removeItem('pokedex_slots_salvos');
    await TestBed.configureTestingModule({
      imports: [PokedexDevicePageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  function setupOpenPokedex() {
    const httpMock = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(PokedexStore);
    const filters = TestBed.inject(PokedexFiltersStore);
    const compare = TestBed.inject(PokedexCompareStore);
    const fixture = TestBed.createComponent(PokedexDevicePageComponent);
    fixture.detectChanges();
    flushInitialRequests(httpMock);

    (fixture.nativeElement.querySelector('#btn-abrir-pokedex') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpMock.match('/api/v1/pokedex/catalog').forEach((req) =>
      req.flush({
        cache: 'hit',
        catalog: {
          count: 3,
          results: [
            { name: 'bulbasaur', url: 'https://pokeapi.co/api/v2/pokemon/1/' },
            { name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon/25/' },
            { name: 'mewtwo', url: 'https://pokeapi.co/api/v2/pokemon/150/' },
          ],
        },
      }),
    );

    return { httpMock, store, filters, compare, fixture };
  }

  it('lazy-loads enriched catalog & meta filters, handles retry, filters combined criteria, and resets', () => {
    const { httpMock, store, filters, fixture } = setupOpenPokedex();
    const hostEl = fixture.nativeElement as HTMLElement;

    expect(filters.panelOpen()).toBe(false);
    (hostEl.querySelector('#btn-filtros-catalogo') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(filters.panelOpen()).toBe(true);

    httpMock
      .expectOne('/api/v1/pokedex/catalog/enriched')
      .flush(null, { status: 503, statusText: 'Down' });
    httpMock.expectOne('/api/v1/pokedex/meta/filters').flush(createMetaFiltersFixture());
    fixture.detectChanges();

    expect(hostEl.querySelector('.filtros-estado--erro')).not.toBeNull();
    (hostEl.querySelector('.filtros-estado--erro .filtro-acao-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/pokedex/catalog/enriched').flush(createEnrichedCatalogFixture());
    httpMock.expectOne('/api/v1/pokedex/meta/filters').flush(createMetaFiltersFixture());
    fixture.detectChanges();

    const electricChip = Array.from(hostEl.querySelectorAll('.filtro-chip')).find((el) =>
      el.textContent?.includes('Electric'),
    ) as HTMLButtonElement;
    electricChip.click();
    fixture.detectChanges();

    expect(filters.activeFilterCount()).toBe(1);
    expect(store.filteredCatalog().items.map((item) => item.name)).toEqual(['pikachu']);

    filters.toggleType('electric');
    filters.toggleFlag('onlyLegendary');
    fixture.detectChanges();
    expect(store.filteredCatalog().items.map((item) => item.name)).toEqual(['mewtwo']);

    const resetBtn = Array.from(hostEl.querySelectorAll('.filtros-rodape .filtro-acao-btn')).find(
      (el) => el.textContent?.includes('Limpar filtros'),
    ) as HTMLButtonElement;
    resetBtn.click();
    fixture.detectChanges();

    expect(filters.hasActiveFilters()).toBe(false);
    expect(store.filteredCatalog().items).toHaveLength(3);
  });

  it('opens 1v1 Comparator dialog from Visor, loads opponent, swaps sides, and opens in Pokedex', async () => {
    const { httpMock, store, compare, fixture } = setupOpenPokedex();
    const hostEl = fixture.nativeElement as HTMLElement;

    store.loadPokemonDetail('pikachu');
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/pikachu/bundle')
      .flush(createCachedPokemonBundleFixture({ id: 25, name: 'pikachu', typeName: 'electric' }));
    fixture.detectChanges();

    (hostEl.querySelector('#btn-comparar-1v1') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compare.dialogOpen()).toBe(true);
    expect(compare.leftState().status).toBe('success');

    compare.selectSide('right', 'mewtwo');
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/pokedex/pokemon/mewtwo/bundle').flush(
      createCachedPokemonBundleFixture({
        id: 150,
        name: 'mewtwo',
        typeName: 'psychic',
        isLegendary: true,
      }),
    );
    fixture.detectChanges();

    expect(compare.statRows()).toHaveLength(7);
    expect(hostEl.querySelector('.compare-stats')).not.toBeNull();
    expect(hostEl.querySelector('.compare-defense')).not.toBeNull();

    compare.swapSides();
    fixture.detectChanges();
    expect(compare.leftState().status === 'success' ? compare.leftState() : null).toMatchObject({
      status: 'success',
      data: { name: 'mewtwo' },
    });

    const openBtns = hostEl.querySelectorAll('.compare-link-btn') as NodeListOf<HTMLButtonElement>;
    openBtns[0]?.click();
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/mewtwo/bundle')
      .flush(createCachedPokemonBundleFixture({ id: 150, name: 'mewtwo', typeName: 'psychic' }));
    fixture.detectChanges();

    expect(compare.dialogOpen()).toBe(false);
    expect(store.selectedPokemon()?.name).toBe('mewtwo');
  });
});
