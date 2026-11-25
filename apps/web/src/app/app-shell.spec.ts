import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { ApiCreditsStore } from './core/stores/api-credits.store';
import { AuthStore } from './core/stores/auth.store';
import { PrivacyConsentStore } from './core/stores/privacy-consent.store';
import { QualityStore } from './core/stores/quality.store';
import { ScenarioStore } from './core/stores/scenario.store';
import { MuseumPageComponent } from './features/regions-museum/museum-page.component';
import { UnderConstructionComponent } from './features/under-construction/under-construction.component';
import { createTrainerFixture, flushInitialRequests } from './testing/test-fixtures.spec-helper';

describe('PokéVerse OS Shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('mounts compact HUD topbar with unified Modules, User, Settings, and Cloud controls', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitialRequests(TestBed.inject(HttpTestingController));

    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.hud-brand__name')?.textContent).toContain('PokéVerse OS');
    expect(compiled.querySelector('pv-hud-quick-dock')).toBeNull();
    expect(compiled.querySelector('pv-cenarios-bar')).toBeNull();

    const topbarText = compiled.querySelector('.hud-topbar')?.textContent ?? '';
    expect(topbarText).not.toContain('Créditos & APIs');
    expect(topbarText).not.toContain('Cookies & LGPD');
    const cloudBtn = compiled.querySelector('.hud-topbar__right .hud-pill--cloud');
    expect(cloudBtn).not.toBeNull();
    expect(cloudBtn?.textContent).toMatch(/Nuvem|Modo Offline/);

    const modulesTrigger = compiled.querySelector('.hud-modules-trigger') as HTMLButtonElement;
    expect(modulesTrigger).not.toBeNull();
    modulesTrigger.click();
    fixture.detectChanges();

    const moduleItems = compiled.querySelectorAll('#pv-modules-popover .hud-menu-item');
    expect(moduleItems).toHaveLength(5);

    const lockedButtons = compiled.querySelectorAll('button.hud-menu-item--locked');
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

  it('manages scenarios, auto-rotation, and hardware quality from the topbar Settings menu', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitialRequests(TestBed.inject(HttpTestingController));
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const scenarioStore = TestBed.inject(ScenarioStore);
    const quality = TestBed.inject(QualityStore);

    const settingsTrigger = compiled.querySelector('.hud-settings-trigger') as HTMLButtonElement;
    expect(settingsTrigger).not.toBeNull();
    settingsTrigger.click();
    fixture.detectChanges();

    const scenarioButtons = Array.from(
      compiled.querySelectorAll('#pv-settings-popover .hud-settings-option'),
    ) as HTMLButtonElement[];
    const florestaBtn = scenarioButtons.find((btn) => btn.textContent?.trim() === 'Floresta');
    expect(florestaBtn).toBeDefined();
    florestaBtn?.click();
    fixture.detectChanges();
    expect(scenarioStore.activeScenario()).toBe('floresta');
    expect(scenarioStore.autoEnabled()).toBe(false);

    const autoBtn = compiled.querySelector('.hud-settings-toggle') as HTMLButtonElement;
    autoBtn.click();
    fixture.detectChanges();
    expect(scenarioStore.autoEnabled()).toBe(true);

    const liteBtn = scenarioButtons.find((btn) => btn.textContent?.trim() === 'Lite');
    expect(liteBtn).toBeDefined();
    liteBtn?.click();
    fixture.detectChanges();
    expect(quality.tier()).toBe('lite');
  });

  it('keeps trainer panel and security/logout actions inside the right-side User menu', async () => {
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
    expect(compiled.querySelector('h1#main-heading')?.textContent).toContain(
      'Museu das Regiões & História',
    );
    expect(compiled.querySelector('.museum-page__header')).not.toBeNull();
    expect(compiled.querySelector('.museum-page__footer')).toBeNull();
    expect(compiled.querySelectorAll('.region-card')).toHaveLength(6);

    const museumFixture = TestBed.createComponent(MuseumPageComponent);
    museumFixture.detectChanges();
    expect(museumFixture.nativeElement.querySelector('.museum-page__footer')).toBeNull();

    const ucFixture = TestBed.createComponent(UnderConstructionComponent);
    ucFixture.detectChanges();
    expect(ucFixture.nativeElement.querySelector('.uc-pokeball')).not.toBeNull();

    const modulesTrigger = compiled.querySelector('.hud-modules-trigger') as HTMLButtonElement;
    modulesTrigger.click();
    fixture.detectChanges();

    const activeLinks = compiled.querySelectorAll('#pv-modules-popover .hud-menu-item.is-active');
    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0]?.textContent).toContain('Museu');

    const auth = TestBed.inject(AuthStore);
    const lockedArcade = compiled.querySelectorAll(
      'button.hud-menu-item--locked',
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

    const rightControls = compiled.querySelector('.hud-topbar__right');
    const userTrigger = rightControls?.querySelector('.hud-pill--trainer') as HTMLButtonElement;
    expect(userTrigger).not.toBeNull();
    expect(userTrigger.textContent).toContain('Red_Kanto • ELO 1000');

    userTrigger.click();
    fixture.detectChanges();

    const userPopover = compiled.querySelector('#pv-user-popover');
    expect(userPopover?.textContent).toContain('Segurança, 2FA & Dados da Conta');
    expect(userPopover?.textContent).toContain('Sair da conta');
  });

  it('renders compact footer with Credits & APIs and Cookies & LGPD dialogs', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitialRequests(TestBed.inject(HttpTestingController));
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const footer = compiled.querySelector('.app-footer');
    expect(footer).not.toBeNull();
    const footerText = footer?.textContent ?? '';
    expect(footerText).toContain('PokéAPI v2');
    expect(footerText).toContain('Nintendo');

    const footerButtons = Array.from(
      compiled.querySelectorAll('.app-footer__link'),
    ) as HTMLButtonElement[];
    const creditsBtn = footerButtons.find((btn) => btn.textContent?.includes('Créditos & APIs'));
    const cookiesBtn = footerButtons.find((btn) => btn.textContent?.includes('Cookies & LGPD'));
    expect(creditsBtn).toBeDefined();
    expect(cookiesBtn).toBeDefined();

    creditsBtn?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const apiCredits = TestBed.inject(ApiCreditsStore);
    expect(apiCredits.dialogOpen()).toBe(true);
    const dialogText = compiled.querySelector('.credits-dialog')?.textContent ?? '';
    expect(dialogText).toContain('Paul Hallett');
    expect(dialogText).toContain('PokéAPI Fair Use Policy');
    expect(dialogText).toContain('The Pokémon Company International');

    apiCredits.closeDialog();
    cookiesBtn?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const privacy = TestBed.inject(PrivacyConsentStore);
    expect(privacy.dialogOpen()).toBe(true);
  });
});
