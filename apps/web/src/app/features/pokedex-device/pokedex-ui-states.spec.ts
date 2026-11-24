import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthStore } from '../../core/stores/auth.store';
import { VisitorLockDialogComponent } from '../../shared/hud/visitor-lock-dialog.component';
import { createCachedPokemonFixture } from '../../testing/test-fixtures.spec-helper';
import { PokedexVisorComponent } from './components/pokedex-visor.component';
import { PokedexRpgNavService } from './services/pokedex-rpg-nav.service';
import { PokedexStore } from './services/pokedex.store';

@Component({
  selector: 'pv-visor-test-host',
  imports: [PokedexVisorComponent],
  providers: [PokedexRpgNavService],
  template: `
    <pv-pokedex-visor
      [detailState]="store.detailState()"
      [cacheSource]="store.cacheSource()"
      [suggestions]="store.suggestions()"
      (retry)="store.retryLastSearch()"
    />
  `,
})
class VisorTestHostComponent {
  readonly store: PokedexStore;

  constructor(store: PokedexStore) {
    this.store = store;
  }
}

describe('Pokedex UI Async States & VisitorLockDialogComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VisorTestHostComponent, VisitorLockDialogComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('renders loading skeleton, Redis HIT badge, direct PokéAPI fallback, and retryable error state in PokedexVisorComponent', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(PokedexStore);
    const fixture = TestBed.createComponent(VisorTestHostComponent);
    fixture.detectChanges();

    const hostEl = fixture.nativeElement as HTMLElement;
    expect(hostEl.querySelector('.estado-vazio')).not.toBeNull();
    expect(hostEl.querySelector('#status-badge')?.textContent).toContain('Aguardando busca');

    store.loadPokemonDetail('pikachu');
    fixture.detectChanges();
    expect(hostEl.querySelector('.skeleton-card')).not.toBeNull();
    expect(hostEl.querySelector('#status-badge')?.textContent).toContain('Buscando...');
    expect(hostEl.querySelector('#resultado-conteudo')?.getAttribute('aria-busy')).toBe('true');

    httpMock
      .expectOne('/api/v1/pokedex/pokemon/pikachu')
      .flush(createCachedPokemonFixture({ id: 25, name: 'pikachu', typeName: 'electric' }));
    fixture.detectChanges();

    expect(hostEl.querySelector('.pokemon-nome')?.textContent).toContain('Pikachu');
    expect(hostEl.querySelector('#status-badge')?.textContent).toContain('Encontrado · Redis');

    store.loadPokemonDetail('bulbasaur');
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/bulbasaur')
      .flush(null, { status: 503, statusText: 'Unavailable' });
    httpMock
      .expectOne('https://pokeapi.co/api/v2/pokemon/bulbasaur')
      .flush(createCachedPokemonFixture({ id: 1, name: 'bulbasaur', typeName: 'grass' }).pokemon);
    fixture.detectChanges();

    expect(store.cacheSource()).toBe('direct');
    expect(hostEl.querySelector('.pokemon-nome')?.textContent).toContain('Bulbasaur');

    store.loadPokemonDetail('mewtwo');
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/mewtwo')
      .flush(null, { status: 503, statusText: 'Unavailable' });
    httpMock
      .expectOne('https://pokeapi.co/api/v2/pokemon/mewtwo')
      .flush(null, { status: 500, statusText: 'Upstream Crash' });
    fixture.detectChanges();

    const retryBtn = hostEl.querySelector(
      '.estado-alerta--erro .btn-secundario',
    ) as HTMLButtonElement;
    expect(retryBtn).not.toBeNull();
    retryBtn.click();
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/mewtwo')
      .flush(createCachedPokemonFixture({ id: 150, name: 'mewtwo', typeName: 'psychic' }));
    fixture.detectChanges();
    expect(hostEl.querySelector('.pokemon-nome')?.textContent).toContain('Mewtwo');
  });

  it('validates VisitorLockDialogComponent modes, local error alert, and submitting busy state', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const auth = TestBed.inject(AuthStore);
    const fixture = TestBed.createComponent(VisitorLockDialogComponent);
    const dialogEl = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    dialogEl.showModal = vi.fn();
    dialogEl.close = vi.fn();

    auth.requestTrainerAccess('Arcade Retrô', 'Entre para salvar seus scores.', '/arcade', 'login');
    fixture.detectChanges();

    const hostEl = fixture.nativeElement as HTMLElement;
    expect(hostEl.querySelector('#pv-visitor-title')?.textContent).toContain('Arcade Retrô');

    const form = hostEl.querySelector('form.auth-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(hostEl.querySelector('#pv-auth-error')?.textContent).toBeTruthy();
    httpMock.expectNone('/api/v1/auth/login');

    const emailInput = hostEl.querySelector('#pv-auth-email') as HTMLInputElement;
    const pwdInput = hostEl.querySelector('#pv-auth-password') as HTMLInputElement;
    emailInput.value = 'red@pokeverse.dev';
    emailInput.dispatchEvent(new Event('input'));
    pwdInput.value = 'Password1234!';
    pwdInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();

    const submitBtn = hostEl.querySelector('.visitor-dialog__btn-primary') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.getAttribute('aria-busy')).toBe('true');
    expect(submitBtn.textContent).toContain('Processando...');

    httpMock.expectOne('/api/v1/auth/login').flush({
      authenticated: true,
      sessionState: 'MFA_PENDING',
      mfaMethods: ['totp', 'backup_code'],
      expiresInSec: 900,
      trainer: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        username: 'Red_Kanto',
        email: 'red@pokeverse.dev',
        emailVerifiedAt: null,
        mfaEnabled: true,
        hasPassword: true,
        role: 'TRAINER',
        badgesCount: 0,
        eloRating: 1000,
        lastMapId: 'pokeverse-town',
        lastX: 400,
        lastY: 320,
        createdAt: new Date().toISOString(),
      },
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.mode()).toBe('mfa-challenge');
    expect(hostEl.querySelector('#pv-auth-otp')).not.toBeNull();
  });
});
