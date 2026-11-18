import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AuthStore } from './core/stores/auth.store';
import { QualityStore } from './core/stores/quality.store';

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

    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.match('/health/ready').forEach((req) => req.flush(null, { status: 503, statusText: 'Down' }));
    httpMock.match('/api/v1/system/bootstrap').forEach((req) => req.flush(null, { status: 503, statusText: 'Down' }));

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

  it('opens and dismisses visitor lock prompt state', () => {
    const auth = TestBed.inject(AuthStore);
    expect(auth.isAuthenticated()).toBe(false);
    auth.requestTrainerAccess('Arcade Retrô', 'Login necessário', '/arcade');
    expect(auth.visitorPrompt()?.targetRoute).toBe('/arcade');
    auth.dismissVisitorPrompt();
    expect(auth.visitorPrompt()).toBeNull();
  });
});
