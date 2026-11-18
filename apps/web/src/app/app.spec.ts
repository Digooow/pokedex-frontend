import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AuthStore } from './core/stores/auth.store';
import { QualityStore } from './core/stores/quality.store';

function flushInitialRequests(httpMock: HttpTestingController): void {
  httpMock.match('/health/ready').forEach((req) => req.flush(null, { status: 503, statusText: 'Down' }));
  httpMock.match('/api/v1/system/bootstrap').forEach((req) => req.flush(null, { status: 503, statusText: 'Down' }));
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

  it('manages opaque BFF session state machine without JWT in JS and updates OTP verification', () => {
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
        emailVerifiedAt: null,
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

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.trainer()?.username).toBe('Red_Kanto');
    expect(auth.trainer()?.emailVerifiedAt).toBeNull();

    auth.verifyEmailOtp({ email: 'red@pokeverse.dev', code: '123456' });
    httpMock.expectOne('/api/v1/auth/verify-email').flush({ message: 'E-mail verificado com sucesso.' });
    expect(auth.trainer()?.emailVerifiedAt).not.toBeNull();

    auth.logout();
    httpMock.expectOne('/api/v1/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.trainer()).toBeNull();
  });
});
