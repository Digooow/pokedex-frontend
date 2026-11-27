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
import {
  createCachedAbilityDetailFixture,
  createCachedEncountersFixture,
  createCachedFormsFixture,
  createCachedMoveDetailFixture,
} from '../../testing/visor-fixtures.spec-helper';
import { PokedexDevicePageComponent } from './pokedex-device.component';
import { PokedexRpgNavService } from './services/pokedex-rpg-nav.service';
import { PokedexVisorDetailStore } from './services/pokedex-visor-detail.store';
import { PokedexStore } from './services/pokedex.store';

describe('Pokedex Visor 2.0 (5 LCD Tabs & Lazy Endpoints)', () => {
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

  function setupDeviceWithPikachu() {
    const httpMock = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(PokedexStore);
    const visorDetail = TestBed.inject(PokedexVisorDetailStore);
    const quality = TestBed.inject(QualityStore);
    const fixture = TestBed.createComponent(PokedexDevicePageComponent);
    fixture.detectChanges();
    flushInitialRequests(httpMock);

    const rpg = fixture.debugElement.injector.get(PokedexRpgNavService);
    (fixture.nativeElement.querySelector('#btn-abrir-pokedex') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpMock
      .match('/api/v1/pokedex/catalog')
      .forEach((req) => req.flush({ cache: 'hit', catalog: { count: 0, results: [] } }));

    store.loadPokemonDetail('pikachu');
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/pikachu/bundle')
      .flush(createCachedPokemonBundleFixture({ id: 25, name: 'pikachu', typeName: 'electric' }));
    fixture.detectChanges();

    return { httpMock, store, visorDetail, quality, rpg, fixture };
  }

  it('shows compact Resumo without duplicated tabs, then expands Holograma for 5 tabs, D-Pad navigation, and media toggles', () => {
    const { visorDetail, quality, rpg, fixture } = setupDeviceWithPikachu();
    const hostEl = fixture.nativeElement as HTMLElement;

    expect(visorDetail.expanded()).toBe(false);
    expect(hostEl.querySelectorAll('[role="tab"]')).toHaveLength(0);
    expect(hostEl.querySelector('.visor-modes')).toBeNull();
    expect(hostEl.querySelector('.visor-holo-launcher')).not.toBeNull();
    expect(visorDetail.activeTab()).toBe('resumo');
    expect(hostEl.querySelector('.pokemon-imagem-box')?.getAttribute('data-pokemon-type')).toBe(
      'electric',
    );
    expect(hostEl.querySelector('.tipo-badge')?.getAttribute('data-pokemon-type')).toBe('electric');
    expect(hostEl.querySelectorAll('.visor-media-bar .visor-segmented')).toHaveLength(2);
    expect(hostEl.querySelector('.visor-lore-text')?.textContent).toContain('Stores electricity');

    const shinyBtn = Array.from(hostEl.querySelectorAll('.visor-media-btn')).find((el) =>
      el.textContent?.includes('Shiny'),
    ) as HTMLButtonElement;
    shinyBtn.click();
    fixture.detectChanges();
    expect(visorDetail.shiny()).toBe(true);
    expect((hostEl.querySelector('.pokemon-imagem') as HTMLImageElement).src).toContain('/shiny/');

    quality.setPreference('lite');
    fixture.detectChanges();
    const animatedBtn = Array.from(hostEl.querySelectorAll('.visor-media-btn')).find((el) =>
      el.textContent?.includes('Animado'),
    ) as HTMLButtonElement;
    expect(animatedBtn.disabled).toBe(true);

    const playMock = vi.fn().mockResolvedValue(undefined);
    const pauseMock = vi.fn();
    const AudioCtor = vi.fn(function () {
      return {
        play: playMock,
        pause: pauseMock,
        onended: null,
        onerror: null,
      };
    });
    vi.stubGlobal('Audio', AudioCtor);
    try {
      const cryBtn = Array.from(hostEl.querySelectorAll('.visor-media-btn')).find((el) =>
        el.textContent?.includes('Ouvir Grito'),
      ) as HTMLButtonElement;
      cryBtn.click();
      fixture.detectChanges();
      expect(AudioCtor).toHaveBeenCalledWith(expect.stringContaining('/latest/25.ogg'));
      expect(visorDetail.playingCry()).toBe('latest');
      visorDetail.stopCry();
    } finally {
      vi.unstubAllGlobals();
    }

    (hostEl.querySelector('#btn-visor-expand') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(visorDetail.expanded()).toBe(true);
    expect(hostEl.querySelector('.visor-modes')).not.toBeNull();
    expect(hostEl.querySelector('.visor-holo-launcher')).toBeNull();
    const tabs = hostEl.querySelectorAll('[role="tab"]') as NodeListOf<HTMLButtonElement>;
    expect(tabs).toHaveLength(5);

    rpg.setScreenFocus('visor', 'itens');
    rpg.navigate('direita');
    fixture.detectChanges();
    expect(visorDetail.activeTab()).toBe('stats');

    rpg.navigate('esquerda');
    fixture.detectChanges();
    expect(visorDetail.activeTab()).toBe('resumo');
  });

  it('opens Stats tab in Holograma with Base Stats, EV Yield, 0x-4x matrix, and lazy Ability inspect with retry', () => {
    const { httpMock, visorDetail, fixture } = setupDeviceWithPikachu();
    const hostEl = fixture.nativeElement as HTMLElement;

    (hostEl.querySelector('#btn-ficha-completa') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(visorDetail.expanded()).toBe(true);
    expect(visorDetail.activeTab()).toBe('stats');

    expect(hostEl.querySelector('.visor-bst-badge')?.textContent).toContain('BST 320');
    expect(hostEl.textContent).toContain('+2 Spe EV');
    expect(hostEl.querySelector('.visor-eff-badge--weak')?.textContent).toContain('2x');
    expect(
      hostEl.querySelector('.visor-eff-group .tipo-badge')?.getAttribute('data-pokemon-type'),
    ).toBe('ground');
    expect(
      hostEl.querySelector('.visor-eff-group .tipo-badge')?.getAttribute('data-pokemon-type'),
    ).toBe('ground');
    expect(hostEl.textContent).toContain('Ground');

    const abilityTrigger = hostEl.querySelector('.visor-accordion-trigger') as HTMLButtonElement;
    abilityTrigger.click();
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/abilities/static')
      .flush(null, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();

    const retryBtn = hostEl.querySelector('.visor-retry-inline') as HTMLButtonElement;
    expect(retryBtn).not.toBeNull();
    retryBtn.click();
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/abilities/static')
      .flush(createCachedAbilityDetailFixture('static'));
    fixture.detectChanges();

    expect(hostEl.textContent).toContain('30% chance of paralyzing');
  });

  it('lazy-loads Forms on Evolution tab in Holograma and loads clicked evolution species in visor', () => {
    const { httpMock, store, fixture } = setupDeviceWithPikachu();
    const hostEl = fixture.nativeElement as HTMLElement;

    (hostEl.querySelector('#btn-visor-expand') as HTMLButtonElement).click();
    fixture.detectChanges();
    (hostEl.querySelector('#visor-tab-evolucao') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/pikachu/forms')
      .flush(createCachedFormsFixture(25, 'pikachu'));
    fixture.detectChanges();

    const evoButtons = hostEl.querySelectorAll('.visor-evo-btn') as NodeListOf<HTMLButtonElement>;
    expect(evoButtons).toHaveLength(2);
    expect(evoButtons[1]?.textContent).toContain('Raichu');

    evoButtons[1]?.click();
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/raichu/bundle')
      .flush(createCachedPokemonBundleFixture({ id: 26, name: 'raichu', typeName: 'electric' }));
    fixture.detectChanges();

    expect(store.selectedPokemon()?.name).toBe('raichu');
  });

  it('filters Moves by learn method and lazy-loads Move details and Encounters/Map tab inside Holograma', () => {
    const { httpMock, fixture } = setupDeviceWithPikachu();
    const hostEl = fixture.nativeElement as HTMLElement;

    (hostEl.querySelector('#btn-visor-expand') as HTMLButtonElement).click();
    fixture.detectChanges();
    (hostEl.querySelector('#visor-tab-golpes') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(hostEl.querySelector('.visor-segmented')).not.toBeNull();
    expect(hostEl.textContent).toContain('Thunder Shock');
    expect(hostEl.textContent).toContain('Light Ball');

    const moveTrigger = hostEl.querySelector('.visor-accordion-trigger') as HTMLButtonElement;
    moveTrigger.click();
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/moves/thunder-shock')
      .flush(createCachedMoveDetailFixture('thunder-shock'));
    fixture.detectChanges();
    expect(hostEl.textContent).toContain('Poder: 40');

    const tmBtn = Array.from(hostEl.querySelectorAll('.visor-media-btn')).find((el) =>
      el.textContent?.includes('TM/HM'),
    ) as HTMLButtonElement;
    tmBtn.click();
    fixture.detectChanges();
    expect(hostEl.textContent).toContain('Thunderbolt');

    (hostEl.querySelector('#visor-tab-mapa') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/pikachu/encounters')
      .flush(createCachedEncountersFixture(25, 'pikachu'));
    fixture.detectChanges();
    expect(hostEl.textContent).toContain('Viridian Forest Area');
    expect(hostEl.textContent).toContain('Red Blue');
  });

  it('opens Stat Calculator in Holograma and computes level, nature, IVs, EVs, and XP', () => {
    const { visorDetail, fixture } = setupDeviceWithPikachu();
    const hostEl = fixture.nativeElement as HTMLElement;

    (hostEl.querySelector('#btn-calc-stats') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(visorDetail.expanded()).toBe(true);
    expect(visorDetail.activeMode()).toBe('calculadora');

    const levelInput = hostEl.querySelector('#calc-level-input') as HTMLInputElement;
    levelInput.value = '100';
    levelInput.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const natureSelect = hostEl.querySelector('#calc-nature-select') as HTMLSelectElement;
    natureSelect.value = 'timid';
    natureSelect.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    expect(hostEl.querySelector('.calc-head__title')?.textContent).toContain('Pikachu · Nv. 100');
    expect(hostEl.querySelector('.calc-footer__total')?.textContent?.trim()).not.toBe('0');
  });
});
