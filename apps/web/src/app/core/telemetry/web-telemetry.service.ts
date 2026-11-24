import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import {
  ClientErrorReportSchema,
  ClientRumBatchSchema,
  type ClientRumSample,
  type HardwareTierLabel,
  type WebVitalMetricName,
} from '@pokeverse/shared';
import { PrivacyConsentStore } from '../stores/privacy-consent.store';
import { QualityStore } from '../stores/quality.store';
import { createTraceparentHeader } from './trace-context.util';

const MAX_RUM_BUFFER = 20;
const MAX_CRASH_REPORTS_PER_SESSION = 5;

interface PerformanceEntryLike {
  readonly startTime: number;
  readonly duration?: number;
  readonly value?: number;
  readonly hadRecentInput?: boolean;
}

function normalizeRoutePath(rawPath: string | undefined): string {
  const pathOnly = (rawPath ?? '/').split('?')[0]?.trim() || '/';
  return pathOnly.startsWith('/') ? pathOnly.slice(0, 120) : `/${pathOnly.slice(0, 119)}`;
}

function toTierLabel(rawTier: string): HardwareTierLabel {
  const upper = rawTier.toUpperCase();
  if (upper === 'ULTRA' || upper === 'LITE') {
    return upper;
  }
  return 'BALANCED';
}

function extractUiErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || 'Unknown UI error';
  }
  if (typeof error === 'string') {
    return error || 'Unknown UI error';
  }
  if (
    typeof error === 'number' ||
    typeof error === 'boolean' ||
    typeof error === 'bigint'
  ) {
    return String(error);
  }
  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string' && error.message.trim()) {
      return error.message;
    }
    try {
      return JSON.stringify(error) ?? 'Unknown UI error';
    } catch {
      return 'Unknown UI error';
    }
  }
  return 'Unknown UI error';
}

@Injectable({ providedIn: 'root' })
export class WebTelemetryService implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly doc = inject(DOCUMENT);
  private readonly privacyConsent = inject(PrivacyConsentStore);
  private readonly quality = inject(QualityStore);

  private readonly lastTraceIdSignal = signal<string | null>(null);
  private readonly rumBuffer: ClientRumSample[] = [];
  private readonly observers: PerformanceObserver[] = [];
  private initialized = false;
  private crashCount = 0;

  readonly lastTraceId = this.lastTraceIdSignal.asReadonly();

  private readonly onVisibilityChange = (): void => {
    if (this.doc.visibilityState === 'hidden') {
      void this.flushRum();
    }
  };

  setLastTraceId(traceId: string): void {
    this.lastTraceIdSignal.set(traceId);
  }

  init(): void {
    if (!this.isBrowser || this.initialized) {
      return;
    }
    this.initialized = true;
    this.observeMetric('largest-contentful-paint', 'LCP');
    this.observeMetric('layout-shift', 'CLS');
    this.observeMetric('longtask', 'LONG_TASK');
    this.doc.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  recordVital(name: WebVitalMetricName, value: number): void {
    if (!this.privacyConsent.optionalTelemetryEnabled()) {
      return;
    }
    const route = normalizeRoutePath(this.doc.location?.pathname);
    const tier = toTierLabel(this.quality.tier());
    const clamped = Math.max(0, Math.min(120_000, Number(value.toFixed(4))));
    if (this.rumBuffer.length >= MAX_RUM_BUFFER) {
      this.rumBuffer.shift();
    }
    this.rumBuffer.push({ name, value: clamped, route, tier });
  }

  async flushRum(): Promise<boolean> {
    if (!this.isBrowser || !this.privacyConsent.optionalTelemetryEnabled()) {
      this.rumBuffer.length = 0;
      return false;
    }
    if (this.rumBuffer.length === 0) {
      return false;
    }

    const batch = this.rumBuffer.splice(0, MAX_RUM_BUFFER);
    const trace = createTraceparentHeader();
    const parsed = ClientRumBatchSchema.safeParse({
      samples: batch,
      traceId: this.lastTraceIdSignal() ?? trace.traceId,
    });
    if (!parsed.success) {
      return false;
    }

    return this.postJson('/api/v1/telemetry/rum', parsed.data, trace.traceparent);
  }

  async reportUiCrash(error: unknown): Promise<boolean> {
    if (!this.isBrowser || !this.privacyConsent.optionalTelemetryEnabled()) {
      return false;
    }
    if (this.crashCount >= MAX_CRASH_REPORTS_PER_SESSION) {
      return false;
    }
    this.crashCount += 1;

    const errName = error instanceof Error ? error.name.slice(0, 120) : 'Error';
    const rawMsg = extractUiErrorMessage(error);
    const rawStack = error instanceof Error ? error.stack?.slice(0, 4000) : undefined;
    const trace = createTraceparentHeader();

    const parsed = ClientErrorReportSchema.safeParse({
      name: errName || 'Error',
      message: (rawMsg || 'Unknown UI error').slice(0, 500),
      route: normalizeRoutePath(this.doc.location?.pathname),
      stack: rawStack,
      tier: toTierLabel(this.quality.tier()),
      traceId: this.lastTraceIdSignal() ?? trace.traceId,
    });
    if (!parsed.success) {
      return false;
    }

    return this.postJson('/api/v1/telemetry/errors', parsed.data, trace.traceparent);
  }

  ngOnDestroy(): void {
    if (this.isBrowser) {
      this.doc.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    for (const observer of this.observers) {
      observer.disconnect();
    }
    this.observers.length = 0;
  }

  private observeMetric(entryType: string, metricName: WebVitalMetricName): void {
    if (typeof PerformanceObserver !== 'function') {
      return;
    }
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as readonly PerformanceEntryLike[]) {
          this.handlePerformanceEntry(metricName, entry);
        }
      });
      observer.observe({ type: entryType, buffered: true });
      this.observers.push(observer);
    } catch {
      return;
    }
  }

  private handlePerformanceEntry(
    metricName: WebVitalMetricName,
    entry: PerformanceEntryLike,
  ): void {
    if (metricName === 'CLS') {
      if (!entry.hadRecentInput && typeof entry.value === 'number') {
        this.recordVital('CLS', entry.value);
      }
      return;
    }
    if (metricName === 'LONG_TASK') {
      this.recordVital('LONG_TASK', entry.duration ?? 0);
      return;
    }
    this.recordVital(metricName, entry.startTime);
  }

  private async postJson(
    endpoint: string,
    payload: unknown,
    traceparent: string,
  ): Promise<boolean> {
    if (typeof fetch !== 'function') {
      return false;
    }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          traceparent,
        },
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
