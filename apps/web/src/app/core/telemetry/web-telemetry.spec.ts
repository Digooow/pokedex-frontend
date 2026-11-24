import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { telemetryTraceInterceptor } from '../interceptors/telemetry-trace.interceptor';
import { PrivacyConsentStore } from '../stores/privacy-consent.store';
import { GlobalErrorHandler } from './global-error-handler';
import { createTraceparentHeader } from './trace-context.util';
import { WebTelemetryService } from './web-telemetry.service';

describe('WebTelemetryService & W3C Trace Propagation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.cookie = 'pokeverse_consent=; Path=/; Max-Age=0';
  });

  it('generates valid W3C traceparent headers and propagates them on same-origin /api/ requests', () => {
    const trace = createTraceparentHeader();
    expect(trace.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([telemetryTraceInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);
    const telemetry = TestBed.inject(WebTelemetryService);

    http.get('/api/v1/pokedex/catalog').subscribe();
    const apiReq = httpMock.expectOne('/api/v1/pokedex/catalog');
    const traceHeader = apiReq.request.headers.get('traceparent');
    expect(traceHeader).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(telemetry.lastTraceId()).toBe(traceHeader?.split('-')[1]);
    apiReq.flush({});

    http.get('https://pokeapi.co/api/v2/pokemon/25').subscribe();
    const externalReq = httpMock.expectOne('https://pokeapi.co/api/v2/pokemon/25');
    expect(externalReq.request.headers.has('traceparent')).toBe(false);
    externalReq.flush({});

    httpMock.verify();
  });

  it('blocks RUM and crash reporting until explicit LGPD opt-in, then dispatches JSON via BFF', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);

    TestBed.configureTestingModule({
      providers: [{ provide: ErrorHandler, useClass: GlobalErrorHandler }],
    });

    const consent = TestBed.inject(PrivacyConsentStore);
    const telemetry = TestBed.inject(WebTelemetryService);
    const errorHandler = TestBed.inject(ErrorHandler);

    consent.acceptEssentialOnly();
    telemetry.recordVital('LCP', 1200);
    await expect(telemetry.flushRum()).resolves.toBe(false);
    await expect(telemetry.reportUiCrash(new Error('No opt-in'))).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();

    consent.acceptAll();
    telemetry.recordVital('LCP', 1250);
    await expect(telemetry.flushRum()).resolves.toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/telemetry/rum',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
      }),
    );

    errorHandler.handleError(new TypeError('Sprite load failed'));
    await Promise.resolve();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/telemetry/errors',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
      }),
    );

    await expect(telemetry.reportUiCrash({ detail: 'WebGL context lost' })).resolves.toBe(true);
    const lastInit = fetchSpy.mock.calls.at(-1)?.[1];
    const lastBody = typeof lastInit?.body === 'string' ? lastInit.body : '';
    expect(lastBody).not.toContain('[object Object]');
    expect(lastBody).toContain('WebGL context lost');
  });
});
