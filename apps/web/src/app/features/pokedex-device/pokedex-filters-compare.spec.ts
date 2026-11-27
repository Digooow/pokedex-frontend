import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  createCachedPokemonBundleFixture,
  flushInitialRequests,
  resetBrowserPreferencesState,
} from '../../testing/test-fixtures.spec-helper';
import {
  createEnrichedCatalogFixture,
  createMetaFiltersFixture,
} from '../../testing/visor-fixtures.spec-helper';
import { PokedexDevicePageComponent } from './pokedex-device.component';
import { PokedexCompareStore } from './services/pokedex-compare.store';
import { PokedexFiltersStore } from './services/pokedex-filters.store';
import { PokedexVisorDetailStore } from './services/pokedex-visor-detail.store';
import { PokedexStore } from './services/pokedex.store';

describe('Pokedex Filters Panel & 1v1 Comparator', () => {
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

    const primaryTab = hostEl.querySelector('#filtro-tab-primary') as HTMLButtonElement;
    const taxonomyTab = hostEl.querySelector('#filtro-tab-taxonomy') as HTMLButtonElement;
    expect(primaryTab.getAttribute('aria-selected')).toBe('true');
    expect(hostEl.querySelector('#filtro-panel-primary')).not.toBeNull();
    expect(hostEl.querySelector('#filtro-panel-taxonomy')).toBeNull();

    const electricChip = Array.from(hostEl.querySelectorAll('.filtro-chip')).find((el) =>
      el.textContent?.includes('Elétrico'),
    ) as HTMLButtonElement;
    expect(electricChip.getAttribute('data-pokemon-type')).toBe('electric');
    electricChip.click();
    fixture.detectChanges();

    expect(filters.activeFilterCount()).toBe(1);
    expect(primaryTab.querySelector('.filtros-tab-count')?.textContent).toContain('1');
    expect(store.filteredCatalog().items.map((item) => item.name)).toEqual(['pikachu']);
    expect(store.displayCatalog().items.length).toBeGreaterThan(1);
    expect(hostEl.querySelector('.catalogo-divisor')?.textContent).toContain('Relacionados');
    expect(hostEl.querySelector('.catalogo-quick-actions')).toBeNull();

    const attributesTab = hostEl.querySelector('#filtro-tab-attributes') as HTMLButtonElement;
    attributesTab.click();
    fixture.detectChanges();
    expect(attributesTab.getAttribute('aria-selected')).toBe('true');
    expect(hostEl.querySelector('#filtro-panel-attributes')).not.toBeNull();

    taxonomyTab.click();
    fixture.detectChanges();
    expect(taxonomyTab.getAttribute('aria-selected')).toBe('true');
    expect(hostEl.querySelector('#filtro-panel-taxonomy')).not.toBeNull();
    expect(hostEl.querySelector('#filtro-panel-taxonomy')?.textContent).toContain('Ordenação');
    expect(hostEl.querySelector('#filtro-panel-taxonomy')?.textContent).toContain('BST mínimo');

    filters.setMinBst(500);
    fixture.detectChanges();
    expect(taxonomyTab.querySelector('.filtros-tab-count')?.textContent).toContain('1');

    taxonomyTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(attributesTab.getAttribute('aria-selected')).toBe('true');
    expect(hostEl.querySelector('#filtro-panel-attributes')).not.toBeNull();

    attributesTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(primaryTab.getAttribute('aria-selected')).toBe('true');
    expect(hostEl.querySelector('#filtro-panel-primary')).not.toBeNull();

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

  it('opens embedded 1v1 Comparator inside Visor, loads opponent, swaps sides, and opens Ficha', async () => {
    const { httpMock, store, compare, fixture } = setupOpenPokedex();
    const visorDetail = TestBed.inject(PokedexVisorDetailStore);
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

    expect(visorDetail.expanded()).toBe(true);
    expect(visorDetail.activeMode()).toBe('comparar');
    expect(compare.leftState().status).toBe('success');
    expect(hostEl.querySelector('.compare-embed__actions')?.textContent).not.toContain('Ver Ficha');

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
    expect(hostEl.querySelector('.compare-verdict')).not.toBeNull();
    expect(hostEl.querySelector('.compare-stats')).not.toBeNull();
    expect(hostEl.querySelector('.compare-defense')).not.toBeNull();
    expect(hostEl.querySelector('.pv-type-badge[data-pokemon-type="electric"]')).not.toBeNull();
    expect(hostEl.querySelector('.pv-type-badge[data-pokemon-type="psychic"]')).not.toBeNull();

    const swapToggleBtn = hostEl.querySelector(
      '.compare-slot[data-side="left"] .compare-slot__top-actions .compare-btn',
    ) as HTMLButtonElement;
    swapToggleBtn.click();
    fixture.detectChanges();
    expect(hostEl.querySelector('#compare-input-left')).not.toBeNull();
    swapToggleBtn.click();
    fixture.detectChanges();
    expect(hostEl.querySelector('#compare-input-left')).toBeNull();

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

    expect(visorDetail.activeMode()).toBe('ficha');
    expect(store.selectedPokemon()?.name).toBe('mewtwo');
  });
});
