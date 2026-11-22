import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { AuthStore } from './core/stores/auth.store';
import { QualityStore } from './core/stores/quality.store';
import { ScenarioStore } from './core/stores/scenario.store';
import { MuseumPageComponent } from './features/regions-museum/museum-page.component';
import { UnderConstructionComponent } from './features/under-construction/under-construction.component';
import { CenariosBarComponent } from './shared/hud/cenarios-bar.component';
import { createTrainerFixture, flushInitialRequests } from './testing/test-fixtures.spec-helper';

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

  it('focuses #main-heading in place when activating the skip link', async () => {
    const router = TestBed.inject(Router);
    router.resetConfig(routes);

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitialRequests(TestBed.inject(HttpTestingController));

    await router.navigateByUrl('/museu');
    await fixture.whenStable();
    fixture.detectChanges();

    const heading = fixture.nativeElement.querySelector('#main-heading') as HTMLHeadingElement;
    expect(heading).not.toBeNull();
    const skipLink = fixture.nativeElement.querySelector('a.skip-link') as HTMLAnchorElement;
    const focusSpy = vi.spyOn(heading, 'focus');
    skipLink.click();

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('cycles hardware quality preferences safely', () => {
    const quality = TestBed.inject(QualityStore);
    quality.setPreference('lite');
    expect(quality.tier()).toBe('lite');
    quality.cyclePreference();
    expect(quality.preference()).toBe('auto');
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
    expect(compiled.querySelector('h1#main-heading')?.textContent).toContain(
      'Museu das Regiões & História',
    );
    expect(compiled.querySelector('.museum-page__header')).not.toBeNull();
    expect(compiled.querySelectorAll('.region-card')).toHaveLength(6);

    const museumFixture = TestBed.createComponent(MuseumPageComponent);
    museumFixture.detectChanges();
    expect(museumFixture.nativeElement.querySelector('.museum-page__header')).not.toBeNull();

    const ucFixture = TestBed.createComponent(UnderConstructionComponent);
    ucFixture.detectChanges();
    expect(ucFixture.nativeElement.querySelector('.uc-pokeball')).not.toBeNull();

    const auth = TestBed.inject(AuthStore);
    const lockedArcade = compiled.querySelectorAll(
      'button.hud-dock__link--locked',
    )[1] as HTMLButtonElement;
    lockedArcade.click();
    expect(auth.visitorPrompt()?.targetRoute).toBe('/arcade');

    auth.login({ email: 'red@pokeverse.dev', password: 'Password1234!' });
    httpMock.expectOne('/api/v1/auth/login').flush({
      authenticated: true,
      sessionState: 'AUTHENTICATED',
      mfaMethods: [],
      expiresInSec: 900,
      trainer: createTrainerFixture({ emailVerifiedAt: new Date().toISOString() }),
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/arcade');
    expect(compiled.querySelector('h1#main-heading')?.textContent).toContain(
      'ainda não implementada',
    );
    expect(compiled.querySelector('.uc-pokemon-img')?.getAttribute('alt')).toContain('Porygon');
  });
});
