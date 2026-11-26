import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  createCachedPokemonBundleFixture,
  flushInitialRequests,
} from '../../testing/test-fixtures.spec-helper';
import { createCachedMoveDetailFixture } from '../../testing/visor-fixtures.spec-helper';
import { PokedexDevicePageComponent } from './pokedex-device.component';
import { PokedexVisorDetailStore } from './services/pokedex-visor-detail.store';
import { PokedexStore } from './services/pokedex.store';

describe('Pokedex Visor Expand (MEL-03) & Competitive Calculator Phase 2 (MEL-04)', () => {
  beforeEach(async () => {
    window.localStorage.removeItem('pokedex_slots_salvos');
    await TestBed.configureTestingModule({
      imports: [PokedexDevicePageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  function mountWithPikachuAndCatalog() {
    const httpMock = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(PokedexStore);
    const visorDetail = TestBed.inject(PokedexVisorDetailStore);
    const fixture = TestBed.createComponent(PokedexDevicePageComponent);
    fixture.detectChanges();
    flushInitialRequests(httpMock);

    (fixture.nativeElement.querySelector('#btn-abrir-pokedex') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpMock.match('/api/v1/pokedex/catalog').forEach((req) =>
      req.flush({
        cache: 'hit',
        catalog: {
          count: 2,
          results: [
            { name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon/25/' },
            { name: 'squirtle', url: 'https://pokeapi.co/api/v2/pokemon/7/' },
          ],
        },
      }),
    );

    store.loadPokemonDetail('pikachu');
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/pikachu/bundle')
      .flush(createCachedPokemonBundleFixture({ id: 25, name: 'pikachu', typeName: 'electric' }));
    fixture.detectChanges();

    return { httpMock, store, visorDetail, fixture };
  }

  it('toggles expanded LCD visor mode and collapses on Escape, backdrop click, or lid close', () => {
    const { store, visorDetail, fixture } = mountWithPikachuAndCatalog();
    const hostEl = fixture.nativeElement as HTMLElement;
    const expandBtn = hostEl.querySelector('#btn-visor-expand') as HTMLButtonElement;
    expect(expandBtn.getAttribute('aria-expanded')).toBe('false');

    expandBtn.click();
    fixture.detectChanges();
    expect(visorDetail.expanded()).toBe(true);
    expect(expandBtn.getAttribute('aria-expanded')).toBe('true');
    const visorSection = hostEl.querySelector('#resultado-area') as HTMLElement;
    expect(visorSection.classList.contains('is-visor-expanded')).toBe(true);
    expect(visorSection.getAttribute('role')).toBe('dialog');
    expect(hostEl.querySelector('.visor-expand-backdrop')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(visorDetail.expanded()).toBe(false);
    expect(store.coverOpen()).toBe(true);

    expandBtn.click();
    fixture.detectChanges();
    expect(visorDetail.expanded()).toBe(true);
    (hostEl.querySelector('.visor-expand-backdrop') as HTMLElement).click();
    fixture.detectChanges();
    expect(visorDetail.expanded()).toBe(false);

    expandBtn.click();
    fixture.detectChanges();
    store.setCoverOpen(false);
    fixture.detectChanges();
    expect(visorDetail.expanded()).toBe(false);
  });

  it('applies Smogon/VGC presets, simulates 1v1 damage with retry, and imports/exports Showdown spreads', () => {
    const { httpMock, visorDetail, fixture } = mountWithPikachuAndCatalog();
    const hostEl = fixture.nativeElement as HTMLElement;

    (hostEl.querySelector('#visor-mode-calculadora') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(visorDetail.activeMode()).toBe('calculadora');

    const presetSelect = hostEl.querySelector('#calc-competitive-preset') as HTMLSelectElement;
    presetSelect.value = 'vgc-fast-special';
    presetSelect.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(hostEl.querySelector('.calc-head__title')?.textContent).toContain('Pikachu · Nv. 50');
    expect(hostEl.querySelector('.calc-presets__ev')?.textContent).toContain('508 / 510');
    const totalBeforeImport = hostEl.querySelector('.calc-footer__total')?.textContent?.trim();

    (hostEl.querySelector('#calc-tab-damage') as HTMLButtonElement).click();
    fixture.detectChanges();

    const learnedSelect = hostEl.querySelector('#dmg-learned-move') as HTMLSelectElement;
    learnedSelect.value = 'thunder-shock';
    learnedSelect.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/moves/thunder-shock')
      .flush(createCachedMoveDetailFixture('thunder-shock'));
    fixture.detectChanges();

    const defInput = hostEl.querySelector('#dmg-defender-input') as HTMLInputElement;
    defInput.value = 'squirtle';
    defInput.dispatchEvent(new Event('input', { bubbles: true }));
    (hostEl.querySelector('#btn-dmg-load') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/squirtle/bundle')
      .flush(null, { status: 503, statusText: 'Unavailable' });
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/squirtle')
      .flush(null, { status: 503, statusText: 'Unavailable' });
    httpMock
      .expectOne('https://pokeapi.co/api/v2/pokemon/squirtle')
      .flush(null, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(hostEl.querySelector('.dmg-state--error')).not.toBeNull();

    (hostEl.querySelector('.dmg-state--error .dmg-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/squirtle/bundle')
      .flush(createCachedPokemonBundleFixture({ id: 7, name: 'squirtle', typeName: 'water' }));
    fixture.detectChanges();

    expect(hostEl.querySelector('.dmg-result__range')?.textContent).toContain('HP');
    expect(hostEl.querySelector('.dmg-eff-badge')?.textContent).toContain('2x');
    expect(hostEl.querySelector('.dmg-stab-badge')?.textContent).toContain('STAB 1.5x');

    (hostEl.querySelector('#calc-tab-io') as HTMLButtonElement).click();
    fixture.detectChanges();
    const exportBox = hostEl.querySelector('#calc-spread-export') as HTMLTextAreaElement;
    expect(exportBox.value).toContain('Level: 50');
    expect(exportBox.value).toContain('Timid Nature');

    const importBox = hostEl.querySelector('#calc-spread-import') as HTMLTextAreaElement;
    importBox.value = 'invalid text without fields';
    importBox.dispatchEvent(new Event('input', { bubbles: true }));
    (hostEl.querySelector('#btn-import-spread') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(hostEl.querySelector('.io-feedback--error')).not.toBeNull();

    importBox.value = 'Pikachu\nLevel: 100\nEVs: 252 Atk / 4 Def / 252 Spe\nJolly Nature';
    importBox.dispatchEvent(new Event('input', { bubbles: true }));
    (hostEl.querySelector('#btn-import-spread') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(hostEl.querySelector('.io-feedback--ok')).not.toBeNull();

    (hostEl.querySelector('#calc-tab-stats') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(hostEl.querySelector('.calc-head__title')?.textContent).toContain('Pikachu · Nv. 100');
    expect(hostEl.querySelector('.calc-footer__total')?.textContent?.trim()).not.toBe(
      totalBeforeImport,
    );
  });
});
