import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { proxyToApiOrigin, stripUpstreamDomainAttribute } from '../../../../cloudflare/api-proxy';
import { App } from '../../app';
import { flushInitialRequests } from '../../testing/test-fixtures.spec-helper';
import { PrivacyConsentStore } from './privacy-consent.store';
import { QualityStore } from './quality.store';

function clearPrivacyTestState(): void {
  document.cookie = 'pokeverse_consent=; Path=/; Max-Age=0';
  window.localStorage.removeItem('pokeverse_perf_pref');
  window.localStorage.removeItem('pokedex_cenario_ativo');
  window.localStorage.removeItem('pokedex_cenario_auto');
  window.localStorage.removeItem('pokedex_slots_salvos');
  window.localStorage.removeItem('custom_non_essential_pref');
}

describe('PrivacyConsentStore & Cloudflare Proxy', () => {
  beforeEach(async () => {
    clearPrivacyTestState();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    clearPrivacyTestState();
  });

  it('persists pokeverse_consent cookie, clears non-essential localStorage on essential-only, and suppresses banner after choice', async () => {
    window.localStorage.setItem('pokeverse_perf_pref', 'lite');
    window.localStorage.setItem('pokedex_cenario_ativo', 'vila');

    const privacy = TestBed.inject(PrivacyConsentStore);
    const quality = TestBed.inject(QualityStore);
    expect(privacy.hasSavedChoice()).toBe(false);
    expect(privacy.hasExplicitFunctionalOptIn()).toBe(false);
    privacy.registerNonEssentialStorageKey('custom_non_essential_pref');
    window.localStorage.setItem('custom_non_essential_pref', '1');

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushInitialRequests(TestBed.inject(HttpTestingController));
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.privacy-banner')).not.toBeNull();

    privacy.acceptEssentialOnly();
    fixture.detectChanges();

    expect(privacy.hasSavedChoice()).toBe(true);
    expect(privacy.canPersistFunctionalPreferences()).toBe(false);
    expect(document.cookie).toContain('pokeverse_consent=');
    expect(window.localStorage.getItem('pokeverse_perf_pref')).toBeNull();
    expect(window.localStorage.getItem('pokedex_cenario_ativo')).toBeNull();
    expect(window.localStorage.getItem('custom_non_essential_pref')).toBeNull();

    quality.setPreference('ultra');
    expect(window.localStorage.getItem('pokeverse_perf_pref')).toBeNull();
    expect(compiled.querySelector('.privacy-banner')).toBeNull();
  });

  it('acceptAll enables explicit functional and optional telemetry opt-in and closes consent dialog', () => {
    const privacy = TestBed.inject(PrivacyConsentStore);
    privacy.openDialog();
    expect(privacy.dialogOpen()).toBe(true);

    privacy.acceptAll();

    expect(privacy.dialogOpen()).toBe(false);
    expect(privacy.hasSavedChoice()).toBe(true);
    expect(privacy.hasExplicitFunctionalOptIn()).toBe(true);
    expect(privacy.canPersistFunctionalPreferences()).toBe(true);
    expect(privacy.optionalTelemetryEnabled()).toBe(true);
    expect(document.cookie).toContain('pokeverse_consent=');
  });

  it('savePreferences preserves functional storage on opt-in and purges registered keys on opt-out', () => {
    const privacy = TestBed.inject(PrivacyConsentStore);
    privacy.registerNonEssentialStorageKey('custom_non_essential_pref');
    window.localStorage.setItem('custom_non_essential_pref', 'keep');

    privacy.savePreferences(true, false);
    expect(privacy.hasExplicitFunctionalOptIn()).toBe(true);
    expect(privacy.optionalTelemetryEnabled()).toBe(false);
    expect(window.localStorage.getItem('custom_non_essential_pref')).toBe('keep');

    privacy.savePreferences(false, false);
    expect(privacy.hasExplicitFunctionalOptIn()).toBe(false);
    expect(privacy.canPersistFunctionalPreferences()).toBe(false);
    expect(window.localStorage.getItem('custom_non_essential_pref')).toBeNull();
  });

  it('strips upstream Domain attribute and preserves multiple Set-Cookie headers in Cloudflare proxy', async () => {
    expect(
      stripUpstreamDomainAttribute(
        '__Secure-pokeverse_refresh=abc; Domain=pokeverse-api.azurecontainerapps.io; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax',
      ),
    ).toBe('__Secure-pokeverse_refresh=abc; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      const headers = new Headers();
      headers.append(
        'set-cookie',
        '__Host-pokeverse_session=sid1; Path=/; HttpOnly; Secure; SameSite=Lax',
      );
      headers.append(
        'set-cookie',
        '__Secure-pokeverse_refresh=ref1; Domain=pokeverse-api.azurecontainerapps.io; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax',
      );
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers }));
    });

    try {
      const proxied = await proxyToApiOrigin({
        request: new Request('https://pokeverse.pages.dev/api/v1/auth/login', {
          method: 'POST',
          body: '{}',
        }),
        env: { API_ORIGIN: 'https://pokeverse-api.azurecontainerapps.io' },
      });
      const outCookies =
        (proxied.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      expect(outCookies).toHaveLength(2);
      expect(outCookies[1]).not.toContain('Domain=');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
