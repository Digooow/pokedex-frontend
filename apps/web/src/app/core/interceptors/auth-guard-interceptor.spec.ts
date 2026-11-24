import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { authGuard } from '../guards/auth.guard';
import { AuthStore } from '../stores/auth.store';
import { createTrainerFixture } from '../../testing/test-fixtures.spec-helper';
import { authInterceptor } from './auth.interceptor';

describe('authGuard & authInterceptor', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
  });

  it('blocks unauthenticated navigation in authGuard, sanitizes external targetRoute, and allows authenticated trainers', () => {
    const auth = TestBed.inject(AuthStore);
    const httpMock = TestBed.inject(HttpTestingController);
    const route = {} as ActivatedRouteSnapshot;

    const blockedResult = TestBed.runInInjectionContext(() =>
      authGuard(route, { url: '/arena' } as RouterStateSnapshot),
    );
    expect(blockedResult instanceof UrlTree || blockedResult === false).toBe(true);
    expect(auth.visitorPrompt()?.title).toContain('Battle Frontier');
    expect(auth.visitorPrompt()?.targetRoute).toBe('/arena');

    TestBed.runInInjectionContext(() =>
      authGuard(route, { url: '//evil.example/phish' } as RouterStateSnapshot),
    );
    expect(auth.visitorPrompt()?.targetRoute).toBeUndefined();

    auth.login({ email: 'red@pokeverse.dev', password: 'Password1234!' });
    httpMock.expectOne('/api/v1/auth/login').flush({
      authenticated: true,
      sessionState: 'AUTHENTICATED',
      mfaMethods: [],
      expiresInSec: 900,
      trainer: createTrainerFixture({ emailVerifiedAt: new Date().toISOString() }),
    });

    const allowedResult = TestBed.runInInjectionContext(() =>
      authGuard(route, { url: '/arena' } as RouterStateSnapshot),
    );
    expect(allowedResult).toBe(true);
  });

  it('attaches withCredentials on /api/* requests and retries once after refreshing an expired session', async () => {
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);

    const requestPromise = firstValueFrom(http.get<{ slots: unknown[] }>('/api/v1/pokedex/slots'));
    const initialReq = httpMock.expectOne('/api/v1/pokedex/slots');
    expect(initialReq.request.withCredentials).toBe(true);
    initialReq.flush({ message: 'Expired' }, { status: 401, statusText: 'Unauthorized' });

    const refreshReq = httpMock.expectOne('/api/v1/auth/refresh');
    expect(refreshReq.request.method).toBe('POST');
    expect(refreshReq.request.withCredentials).toBe(true);
    refreshReq.flush({
      authenticated: true,
      sessionState: 'AUTHENTICATED',
      mfaMethods: [],
      expiresInSec: 900,
      trainer: createTrainerFixture({ emailVerifiedAt: new Date().toISOString() }),
    });

    await vi.waitFor(() => {
      const retriedReq = httpMock.expectOne('/api/v1/pokedex/slots');
      expect(retriedReq.request.withCredentials).toBe(true);
      retriedReq.flush({ slots: [] });
    });

    expect(await requestPromise).toEqual({ slots: [] });
  });

  it('skips refresh loop on /api/v1/auth/login and external URLs, and propagates 401 when refresh fails', async () => {
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);

    const externalPromise = firstValueFrom(http.get('https://pokeapi.co/api/v2/pokemon/25'));
    const externalReq = httpMock.expectOne('https://pokeapi.co/api/v2/pokemon/25');
    expect(externalReq.request.withCredentials).toBe(false);
    externalReq.flush({ id: 25 });
    await externalPromise;

    const loginFailPromise = firstValueFrom(
      http.post('/api/v1/auth/login', { email: 'a@b.com', password: 'wrong-password' }),
    );
    httpMock
      .expectOne('/api/v1/auth/login')
      .flush({ message: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });
    await expect(loginFailPromise).rejects.toMatchObject({ status: 401 });
    httpMock.expectNone('/api/v1/auth/refresh');

    const protectedFailPromise = firstValueFrom(http.get('/api/v1/auth/me'));
    httpMock
      .expectOne('/api/v1/auth/me')
      .flush({ message: 'Expired' }, { status: 401, statusText: 'Unauthorized' });
    httpMock
      .expectOne('/api/v1/auth/refresh')
      .flush({ message: 'Revoked' }, { status: 401, statusText: 'Unauthorized' });
    await expect(protectedFailPromise).rejects.toMatchObject({ status: 401 });
  });
});
