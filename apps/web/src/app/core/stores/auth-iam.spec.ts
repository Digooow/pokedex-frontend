import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from '../../app.routes';
import { createTrainerFixture } from '../../testing/test-fixtures.spec-helper';
import { AuthStore } from './auth.store';
import { SecurityIamStore } from './security-iam.store';

describe('AuthStore & SecurityIamStore', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('manages opaque BFF session state machine without JWT in JS and updates OTP verification', async () => {
    const auth = TestBed.inject(AuthStore);
    const httpMock = TestBed.inject(HttpTestingController);

    expect(auth.isAuthenticated()).toBe(false);
    auth.login({ email: 'red@pokeverse.dev', password: 'Password1234!' });

    httpMock.expectOne('/api/v1/auth/login').flush({
      authenticated: true,
      sessionState: 'MFA_PENDING',
      mfaMethods: ['totp'],
      expiresInSec: 900,
      trainer: createTrainerFixture({ mfaEnabled: true }),
    });

    expect(auth.isMfaPending()).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);

    auth.verifyMfaChallenge({ method: 'totp', code: '123456' });
    httpMock.expectOne('/api/v1/auth/mfa/verify').flush({
      authenticated: true,
      sessionState: 'AUTHENTICATED',
      mfaMethods: ['totp', 'backup_code'],
      expiresInSec: 900,
      trainer: createTrainerFixture({ mfaEnabled: true }),
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
    httpMock
      .expectOne('/api/v1/auth/verify-email')
      .flush({ message: 'E-mail verificado com sucesso.' });
    expect(auth.trainer()?.emailVerifiedAt).not.toBeNull();
    expect(auth.visitorPrompt()).toBeNull();
    expect(navSpy).toHaveBeenCalledWith('/arena');
    await navSpy.mock.results[0]?.value;
    expect(router.url).toBe('/arena');

    auth.logout();
    httpMock
      .expectOne('/api/v1/auth/logout')
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.trainer()).toBeNull();
  });

  it('handles ?googleLinked=1 callback return by cleaning URL, opening security modal, and surfacing feedback', () => {
    const auth = TestBed.inject(AuthStore);
    const iam = TestBed.inject(SecurityIamStore);
    const httpMock = TestBed.inject(HttpTestingController);
    const originalUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    window.history.replaceState(null, '', '/?googleLinked=1&tab=keep');
    try {
      auth.restoreSession();
      httpMock
        .expectOne('/api/v1/auth/providers')
        .flush({ googleEnabled: true, webauthnEnabled: true });
      httpMock.expectOne('/api/v1/auth/session').flush({
        authenticated: true,
        sessionState: 'AUTHENTICATED',
        mfaMethods: ['totp', 'backup_code'],
        expiresInSec: 900,
        trainer: createTrainerFixture({
          emailVerifiedAt: new Date().toISOString(),
          mfaEnabled: true,
        }),
      });

      expect(window.location.search).toBe('?tab=keep');
      expect(auth.securityModalOpen()).toBe(true);

      iam.openDialog();
      expect(iam.feedback()).toEqual({
        tone: 'ok',
        text: 'Conta Google vinculada com sucesso via OAuth 2.0 PKCE.',
      });
      httpMock.expectOne('/api/v1/auth/security/overview').flush({
        mfaEnabled: true,
        hasPassword: true,
        passkeys: [],
        providers: {
          googleEnabled: true,
          googleLinked: true,
          googleEmail: 'red@pokeverse.dev',
        },
      });
    } finally {
      window.history.replaceState(null, '', originalUrl || '/');
    }
  });

  it('handles ?authError from Google OAuth callback for both authenticated linking errors and visitor login failures', () => {
    const auth = TestBed.inject(AuthStore);
    const iam = TestBed.inject(SecurityIamStore);
    const httpMock = TestBed.inject(HttpTestingController);
    const originalUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    window.history.replaceState(null, '', '/?authError=google_already_linked');
    try {
      auth.restoreSession();
      httpMock
        .expectOne('/api/v1/auth/providers')
        .flush({ googleEnabled: true, webauthnEnabled: true });
      httpMock.expectOne('/api/v1/auth/session').flush({
        authenticated: true,
        sessionState: 'AUTHENTICATED',
        mfaMethods: [],
        expiresInSec: 900,
        trainer: createTrainerFixture({ emailVerifiedAt: new Date().toISOString() }),
      });

      expect(window.location.search).toBe('');
      expect(auth.securityModalOpen()).toBe(true);
      iam.openDialog();
      expect(iam.feedback()).toEqual({
        tone: 'error',
        text: 'Esta conta Google já está vinculada a outro Treinador.',
      });
      httpMock.expectOne('/api/v1/auth/security/overview').flush({
        mfaEnabled: false,
        hasPassword: true,
        passkeys: [],
        providers: {
          googleEnabled: true,
          googleLinked: false,
          googleEmail: null,
        },
      });

      window.history.replaceState(null, '', '/?authError=google_cancelled');
      auth.restoreSession();
      httpMock
        .expectOne('/api/v1/auth/providers')
        .flush({ googleEnabled: true, webauthnEnabled: true });
      httpMock.expectOne('/api/v1/auth/session').flush({
        authenticated: false,
        canRefresh: false,
      });

      expect(window.location.search).toBe('');
      expect(auth.visitorPrompt()?.initialMode).toBe('login');
      expect(auth.mutationState()).toEqual({
        status: 'error',
        message: 'Autenticação com Google foi cancelada.',
      });
    } finally {
      window.history.replaceState(null, '', originalUrl || '/');
    }
  });

  it('manages active sessions and revokes other sessions in SecurityIamStore', async () => {
    const iam = TestBed.inject(SecurityIamStore);
    const httpMock = TestBed.inject(HttpTestingController);

    const loadPromise = iam.loadSessions();
    httpMock.expectOne('/api/v1/auth/sessions').flush({
      sessions: [
        {
          familyId: '550e8400-e29b-41d4-a716-446655440001',
          createdAt: '2026-11-20T10:00:00.000Z',
          expiresAt: '2026-11-27T10:00:00.000Z',
          isCurrent: true,
        },
        {
          familyId: '550e8400-e29b-41d4-a716-446655440002',
          createdAt: '2026-11-19T10:00:00.000Z',
          expiresAt: '2026-11-26T10:00:00.000Z',
          isCurrent: false,
        },
      ],
    });
    await loadPromise;
    expect(iam.sessionsState().status).toBe('ready');

    const revokePromise = iam.revokeOtherSessions();
    httpMock.expectOne('/api/v1/auth/sessions/revoke-others').flush({
      revokedCount: 1,
      message: '1 outra(s) sessão(ões) encerrada(s) com sucesso.',
    });
    await Promise.resolve();
    httpMock.expectOne('/api/v1/auth/sessions').flush({
      sessions: [
        {
          familyId: '550e8400-e29b-41d4-a716-446655440001',
          createdAt: '2026-11-20T10:00:00.000Z',
          expiresAt: '2026-11-27T10:00:00.000Z',
          isCurrent: true,
        },
      ],
    });
    await revokePromise;
    expect(iam.feedback()?.tone).toBe('ok');
  });

  it('deletes trainer account via DELETE /api/v1/auth/me (LGPD) and clears local auth session', async () => {
    const auth = TestBed.inject(AuthStore);
    const iam = TestBed.inject(SecurityIamStore);
    const httpMock = TestBed.inject(HttpTestingController);

    auth.login({ email: 'red@pokeverse.dev', password: 'Password1234!' });
    httpMock.expectOne('/api/v1/auth/login').flush({
      authenticated: true,
      sessionState: 'AUTHENTICATED',
      mfaMethods: [],
      expiresInSec: 900,
      trainer: createTrainerFixture({ emailVerifiedAt: new Date().toISOString() }),
    });
    expect(auth.isAuthenticated()).toBe(true);

    const deletePromise = iam.deleteAccount();
    httpMock.expectOne('/api/v1/auth/me').flush({
      message: 'Conta de treinador e dados pessoais eliminados permanentemente (LGPD).',
    });
    await Promise.resolve();
    httpMock
      .expectOne('/api/v1/auth/logout')
      .flush(null, { status: 204, statusText: 'No Content' });
    await deletePromise;

    expect(iam.dialogOpen()).toBe(false);
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.trainer()).toBeNull();
  });
});
