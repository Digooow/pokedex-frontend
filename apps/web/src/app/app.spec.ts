import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { AuthStore } from './core/stores/auth.store';
import { QualityStore } from './core/stores/quality.store';
import { ScenarioStore } from './core/stores/scenario.store';
import { PokedexDevicePageComponent } from './features/pokedex-device/pokedex-device.component';
import { PokedexRpgNavService } from './features/pokedex-device/services/pokedex-rpg-nav.service';
import { PokedexSlotsStore } from './features/pokedex-device/services/pokedex-slots.store';
import { PokedexStore } from './features/pokedex-device/services/pokedex.store';
import { MuseumPageComponent } from './features/regions-museum/museum-page.component';
import { UnderConstructionComponent } from './features/under-construction/under-construction.component';
import { CenariosBarComponent } from './shared/hud/cenarios-bar.component';

function flushInitialRequests(httpMock: HttpTestingController): void {
  httpMock.match('/health/ready').forEach((req) => req.flush(null, { status: 503, statusText: 'Down' }));
  httpMock.match('/api/v1/system/bootstrap').forEach((req) => req.flush(null, { status: 503, statusText: 'Down' }));
  httpMock.match('/api/v1/auth/providers').forEach((req) => req.flush({ googleEnabled: false, webauthnEnabled: true }));
  httpMock.match('/api/v1/auth/session').forEach((req) => req.flush({ authenticated: false, canRefresh: false }));
}

describe('PokéVerse OS Shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('mounts HUD topbar, quick dock, and renders locked modules as focusable buttons', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    flushInitialRequests(TestBed.inject(HttpTestingController));

    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.hud-brand__name')?.textContent).toContain('PokéVerse OS');
    expect(compiled.querySelectorAll('.hud-dock__item')).toHaveLength(5);

    const lockedButtons = compiled.querySelectorAll('button.hud-dock__link--locked');
    expect(lockedButtons).toHaveLength(3);
    expect(lockedButtons[0]?.getAttribute('aria-disabled')).toBe('true');

    const auth = TestBed.inject(AuthStore);
    (lockedButtons[0] as HTMLButtonElement).click();
    expect(auth.visitorPrompt()?.title).toBe('Vila Central');
  });

  it('focuses #main-heading in place when activating the skip link', () => {
    const heading = document.createElement('h1');
    heading.id = 'main-heading';
    heading.tabIndex = -1;
    document.body.appendChild(heading);

    try {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      flushInitialRequests(TestBed.inject(HttpTestingController));

      const skipLink = fixture.nativeElement.querySelector('a.skip-link') as HTMLAnchorElement;
      const focusSpy = vi.spyOn(heading, 'focus');
      skipLink.click();

      expect(focusSpy).toHaveBeenCalledTimes(1);
    } finally {
      heading.remove();
    }
  });

  it('cycles hardware quality preferences safely', () => {
    const quality = TestBed.inject(QualityStore);
    quality.setPreference('lite');
    expect(quality.tier()).toBe('lite');
    quality.cyclePreference();
    expect(quality.preference()).toBe('auto');
  });

  it('manages opaque BFF session state machine without JWT in JS and updates OTP verification', async () => {
    const auth = TestBed.inject(AuthStore);
    const httpMock = TestBed.inject(HttpTestingController);

    expect(auth.isAuthenticated()).toBe(false);
    auth.login({ email: 'red@pokeverse.dev', password: 'Password1234!' });

    const loginReq = httpMock.expectOne('/api/v1/auth/login');
    loginReq.flush({
      authenticated: true,
      sessionState: 'MFA_PENDING',
      mfaMethods: ['totp'],
      expiresInSec: 900,
      trainer: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        username: 'Red_Kanto',
        email: 'red@pokeverse.dev',
        emailVerifiedAt: null,
        mfaEnabled: true,
        hasPassword: true,
        badgesCount: 0,
        eloRating: 1000,
        lastMapId: 'pokeverse-town',
        lastX: 400,
        lastY: 320,
        createdAt: new Date().toISOString(),
      },
    });

    expect(auth.isMfaPending()).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);

    auth.verifyMfaChallenge({ method: 'totp', code: '123456' });
    httpMock.expectOne('/api/v1/auth/mfa/verify').flush({
      authenticated: true,
      sessionState: 'AUTHENTICATED',
      mfaMethods: ['totp', 'backup_code'],
      expiresInSec: 900,
      trainer: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        username: 'Red_Kanto',
        email: 'red@pokeverse.dev',
        emailVerifiedAt: null,
        mfaEnabled: true,
        hasPassword: true,
        badgesCount: 0,
        eloRating: 1000,
        lastMapId: 'pokeverse-town',
        lastX: 400,
        lastY: 320,
        createdAt: new Date().toISOString(),
      },
    });

    expect(auth.isMfaPending()).toBe(false);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.trainer()?.username).toBe('Red_Kanto');
    expect(auth.trainer()?.emailVerifiedAt).toBeNull();

    const router = TestBed.inject(Router);
    router.resetConfig(routes);
    const navSpy = vi.spyOn(router, 'navigateByUrl');
    auth.requestTrainerAccess('Verificar E-mail', 'Confirme seu OTP.', '/arena', 'verify-email');
    expect(auth.visitorPrompt()).not.toBeNull();
    auth.verifyEmailOtp({ email: 'RED@POKEVERSE.DEV', code: '123456' });
    httpMock.expectOne('/api/v1/auth/verify-email').flush({ message: 'E-mail verificado com sucesso.' });
    expect(auth.trainer()?.emailVerifiedAt).not.toBeNull();
    expect(auth.visitorPrompt()).toBeNull();
    expect(navSpy).toHaveBeenCalledWith('/arena');
    await navSpy.mock.results[0]?.value;
    expect(router.url).toBe('/arena');

    auth.logout();
    httpMock.expectOne('/api/v1/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.trainer()).toBeNull();
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
        catalog: { count: 1, results: [{ name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon/25/' }] },
      }),
    );

    expect(store.coverOpen()).toBe(true);
    expect(aparelho.dataset['aberta']).toBe('true');
  });

  it('manages scenario selection and auto-rotation toggle cleanly in ScenarioStore', () => {
    const scenarioStore = TestBed.inject(ScenarioStore);
    expect(scenarioStore.activeScenario()).toBe('hoenn');

    scenarioStore.selectScenario('cidade', true);
    expect(scenarioStore.activeScenario()).toBe('cidade');
    expect(scenarioStore.autoEnabled()).toBe(false);

    scenarioStore.toggleAuto();
    expect(scenarioStore.autoEnabled()).toBe(true);
    expect(scenarioStore.activeScenario()).toBe('vila');

    scenarioStore.cycleScenario();
    expect(scenarioStore.autoEnabled()).toBe(false);
    expect(scenarioStore.activeScenario()).toBe('floresta');
    expect(scenarioStore.activeScenarioLabel()).toBe('Floresta');

    const barFixture = TestBed.createComponent(CenariosBarComponent);
    barFixture.detectChanges();
    const scenarioButtons = barFixture.nativeElement.querySelectorAll('.btn-cenario');
    expect(scenarioButtons).toHaveLength(1);
    expect(scenarioButtons[0]?.textContent).toContain('Cenário: Floresta');
    (scenarioButtons[0] as HTMLButtonElement).click();
    barFixture.detectChanges();
    expect(scenarioStore.activeScenario()).toBe('hoenn');
    expect(scenarioButtons[0]?.textContent).toContain('Cenário: Hoenn');
  });

  it('supports visitor local slot persistence and clearAll cleanly in PokedexSlotsStore', () => {
    window.localStorage.removeItem('pokedex_slots_salvos');
    const slotsStore = TestBed.inject(PokedexSlotsStore);
    const pikachu = { id: 25, name: 'pikachu', displayName: 'Pikachu', spriteUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png' };

    slotsStore.saveSlot(0, pikachu, 'Sparky');
    expect(slotsStore.slotsMap().get(0)?.nickname).toBe('Sparky');

    slotsStore.clearSlot(0);
    expect(slotsStore.slotsMap().get(0)).toBeUndefined();

    slotsStore.saveSlot(2, pikachu);
    slotsStore.clearAllSlots();
    expect(slotsStore.slotsMap().size).toBe(0);
  });

  it('prevents duplicate Pokémon across slots and manages overwrite/delete confirm state', () => {
    window.localStorage.removeItem('pokedex_slots_salvos');
    const slotsStore = TestBed.inject(PokedexSlotsStore);
    const pikachu = { id: 25, name: 'pikachu', displayName: 'Pikachu', spriteUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png' };
    const bulbasaur = { id: 1, name: 'bulbasaur', displayName: 'Bulbasaur', spriteUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png' };

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
      const openBtn = fixture.nativeElement.querySelector('#btn-abrir-pokedex') as HTMLButtonElement;

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
          items: [{ id: 25, name: 'pikachu', displayName: 'Pikachu', spriteUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png' }],
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
    const items = fixture.nativeElement.querySelectorAll('.catalogo-item') as NodeListOf<HTMLButtonElement>;
    const btnA = fixture.nativeElement.querySelector('#btn-controle-selecionar') as HTMLButtonElement;

    items[1]?.click();
    fixture.detectChanges();
    expect(rpg.rpgCatalogIndex()).toBe(1);
    expect(items[1]?.classList.contains('is-cursor')).toBe(true);
    httpMock.expectNone('/api/v1/pokedex/pokemon/charmander');
    expect(store.detailState().status).toBe('empty');

    btnA.click();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/pokedex/pokemon/charmander').flush({
      cache: 'hit',
      pokemon: {
        id: 4,
        name: 'charmander',
        height: 6,
        weight: 85,
        types: [{ slot: 1, type: { name: 'fire', url: 'https://pokeapi.co/api/v2/type/10/' } }],
        abilities: [],
        stats: [],
        sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png' },
      },
    });
    expect(store.selectedPokemon()?.name).toBe('charmander');

    const input = fixture.nativeElement.querySelector('#pokemon-input') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const updatedItems = fixture.nativeElement.querySelectorAll('.catalogo-item') as NodeListOf<HTMLButtonElement>;
    updatedItems[0]?.click();
    fixture.detectChanges();
    expect(rpg.rpgCatalogIndex()).toBe(0);
    httpMock.expectNone('/api/v1/pokedex/pokemon/bulbasaur');

    updatedItems[0]?.click();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/pokedex/pokemon/bulbasaur').flush({
      cache: 'hit',
      pokemon: {
        id: 1,
        name: 'bulbasaur',
        height: 7,
        weight: 69,
        types: [{ slot: 1, type: { name: 'grass', url: 'https://pokeapi.co/api/v2/type/12/' } }],
        abilities: [],
        stats: [],
        sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png' },
      },
    });
    expect(store.selectedPokemon()?.name).toBe('bulbasaur');
  });

  it('renders Museum header card + handcrafted UnderConstruction screen and syncs dock & redirect', async () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    router.resetConfig(routes);

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitialRequests(httpMock);

    await router.navigateByUrl('/museu');
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const activeLinks = compiled.querySelectorAll('.hud-dock__link.is-active');
    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0]?.textContent).toContain('Museu');

    expect(compiled.querySelector('h1#main-heading')?.textContent).toContain('Museu das Regiões & História');
    expect(compiled.querySelector('.museum-page__header')).not.toBeNull();
    expect(compiled.querySelectorAll('.region-card')).toHaveLength(6);

    const museumFixture = TestBed.createComponent(MuseumPageComponent);
    museumFixture.detectChanges();
    expect(museumFixture.nativeElement.querySelector('.museum-page__header')).not.toBeNull();

    const ucFixture = TestBed.createComponent(UnderConstructionComponent);
    ucFixture.detectChanges();
    expect(ucFixture.nativeElement.querySelector('.uc-pokeball')).not.toBeNull();

    const auth = TestBed.inject(AuthStore);
    const lockedArcade = compiled.querySelectorAll('button.hud-dock__link--locked')[1] as HTMLButtonElement;
    lockedArcade.click();
    expect(auth.visitorPrompt()?.targetRoute).toBe('/arcade');

    auth.login({ email: 'red@pokeverse.dev', password: 'Password1234!' });
    httpMock.expectOne('/api/v1/auth/login').flush({
      authenticated: true,
      sessionState: 'AUTHENTICATED',
      mfaMethods: [],
      expiresInSec: 900,
      trainer: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        username: 'Red_Kanto',
        email: 'red@pokeverse.dev',
        emailVerifiedAt: new Date().toISOString(),
        mfaEnabled: false,
        hasPassword: true,
        badgesCount: 0,
        eloRating: 1000,
        lastMapId: 'pokeverse-town',
        lastX: 400,
        lastY: 320,
        createdAt: new Date().toISOString(),
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/arcade');
    expect(compiled.querySelector('h1#main-heading')?.textContent).toContain('ainda não implementada');
    expect(compiled.querySelector('.uc-pokemon-img')?.getAttribute('alt')).toContain('Porygon');
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

    const pichuItems = fixture.nativeElement.querySelectorAll('.catalogo-item') as NodeListOf<HTMLButtonElement>;
    expect(pichuItems).toHaveLength(2);

    pichuItems[1]?.click();
    fixture.detectChanges();
    pichuItems[1]?.click();
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/pokedex/pokemon/pikachu-original-cap').flush({
      cache: 'hit',
      pokemon: {
        id: 10094,
        name: 'pikachu-original-cap',
        height: 4,
        weight: 60,
        types: [{ slot: 1, type: { name: 'electric', url: 'https://pokeapi.co/api/v2/type/13/' } }],
        abilities: [],
        stats: [],
        sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10094.png' },
      },
    });
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

  it('opens the Pokémon stored in another blue slot directly on click without opening overwrite confirmation modal', () => {
    window.localStorage.removeItem('pokedex_slots_salvos');
    const httpMock = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(PokedexStore);
    const slotsStore = TestBed.inject(PokedexSlotsStore);

    slotsStore.saveSlot(0, {
      id: 25,
      name: 'pikachu',
      displayName: 'Pikachu',
      spriteUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
    });
    slotsStore.saveSlot(1, {
      id: 1,
      name: 'bulbasaur',
      displayName: 'Bulbasaur',
      spriteUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png',
    });

    const fixture = TestBed.createComponent(PokedexDevicePageComponent);
    fixture.detectChanges();
    flushInitialRequests(httpMock);

    const openBtn = fixture.nativeElement.querySelector('#btn-abrir-pokedex') as HTMLButtonElement;
    openBtn.click();
    fixture.detectChanges();
    httpMock.match('/api/v1/pokedex/catalog').forEach((req) =>
      req.flush({ cache: 'hit', catalog: { count: 0, results: [] } }),
    );

    const slotButtons = fixture.nativeElement.querySelectorAll('.btn-slot-azul') as NodeListOf<HTMLButtonElement>;
    slotButtons[0]?.click();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/pokedex/pokemon/pikachu').flush({
      cache: 'hit',
      pokemon: {
        id: 25,
        name: 'pikachu',
        height: 4,
        weight: 60,
        types: [{ slot: 1, type: { name: 'electric', url: 'https://pokeapi.co/api/v2/type/13/' } }],
        abilities: [],
        stats: [],
        sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png' },
      },
    });
    expect(store.selectedPokemon()?.name).toBe('pikachu');

    slotButtons[1]?.click();
    fixture.detectChanges();
    expect(slotsStore.pendingConfirm()).toBeNull();
    httpMock.expectOne('/api/v1/pokedex/pokemon/bulbasaur').flush({
      cache: 'hit',
      pokemon: {
        id: 1,
        name: 'bulbasaur',
        height: 7,
        weight: 69,
        types: [{ slot: 1, type: { name: 'grass', url: 'https://pokeapi.co/api/v2/type/12/' } }],
        abilities: [],
        stats: [],
        sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png' },
      },
    });
    expect(store.selectedPokemon()?.name).toBe('bulbasaur');
  });
});
