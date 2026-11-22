import { isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import {
  PRIVACY_CONSENT_VERSION,
  type PrivacyConsent,
  PrivacyConsentSchema,
} from '@pokeverse/shared';

const CONSENT_COOKIE_NAME = 'pokeverse_consent';
const CONSENT_MAX_AGE_SEC = 180 * 86_400;
const CONSENT_CHANNEL_NAME = 'pokeverse_consent_sync';
const INITIAL_NON_ESSENTIAL_STORAGE_KEYS = [
  'pokeverse_perf_pref',
  'pokedex_cenario_ativo',
  'pokedex_cenario_auto',
  'pokedex_slots_salvos',
] as const;

@Injectable({ providedIn: 'root' })
export class PrivacyConsentStore implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly nonEssentialStorageKeys = new Set<string>(INITIAL_NON_ESSENTIAL_STORAGE_KEYS);
  private readonly consentSignal = signal<PrivacyConsent | null>(this.readConsentCookie());
  private readonly dialogOpenSignal = signal(false);
  private readonly channel: BroadcastChannel | null = this.openBroadcastChannel();

  readonly consent = this.consentSignal.asReadonly();
  readonly dialogOpen = this.dialogOpenSignal.asReadonly();
  readonly hasSavedChoice = computed(() => this.consentSignal() !== null);
  readonly hasExplicitFunctionalOptIn = computed(
    () => this.consentSignal()?.functionalPreferences === true,
  );
  readonly canPersistFunctionalPreferences = computed(
    () => this.consentSignal()?.functionalPreferences ?? true,
  );
  readonly optionalTelemetryEnabled = computed(
    () => this.consentSignal()?.optionalTelemetry ?? false,
  );

  registerNonEssentialStorageKey(...keys: readonly string[]): void {
    for (const key of keys) {
      const normalized = key.trim();
      if (normalized) {
        this.nonEssentialStorageKeys.add(normalized);
      }
    }
  }

  openDialog(): void {
    this.dialogOpenSignal.set(true);
  }

  closeDialog(): void {
    this.dialogOpenSignal.set(false);
  }

  acceptAll(): void {
    this.persistConsent(true, true);
    this.dialogOpenSignal.set(false);
  }

  acceptEssentialOnly(): void {
    this.persistConsent(false, false);
    this.clearLocalNonEssentialStorage();
    this.dialogOpenSignal.set(false);
  }

  savePreferences(functionalPreferences: boolean, optionalTelemetry: boolean): void {
    this.persistConsent(functionalPreferences, optionalTelemetry);
    if (!functionalPreferences) {
      this.clearLocalNonEssentialStorage();
    }
    this.dialogOpenSignal.set(false);
  }

  clearLocalNonEssentialStorage(): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      for (const key of this.nonEssentialStorageKeys) {
        window.localStorage.removeItem(key);
      }
    } catch {
      return;
    }
  }

  ngOnDestroy(): void {
    this.channel?.close();
  }

  private persistConsent(functionalPreferences: boolean, optionalTelemetry: boolean): void {
    const record = PrivacyConsentSchema.parse({
      version: PRIVACY_CONSENT_VERSION,
      essential: true,
      functionalPreferences,
      optionalTelemetry,
      updatedAt: new Date().toISOString(),
    });
    this.consentSignal.set(record);
    this.writeConsentCookie(record);
    this.channel?.postMessage(record);
  }

  private readConsentCookie(): PrivacyConsent | null {
    if (!this.isBrowser) {
      return null;
    }
    try {
      const pairs = document.cookie ? document.cookie.split(';') : [];
      for (const pair of pairs) {
        const idx = pair.indexOf('=');
        if (idx <= 0) {
          continue;
        }
        const name = pair.slice(0, idx).trim();
        if (name !== CONSENT_COOKIE_NAME) {
          continue;
        }
        const rawValue = decodeURIComponent(pair.slice(idx + 1).trim());
        const parsed = PrivacyConsentSchema.safeParse(JSON.parse(rawValue));
        return parsed.success ? parsed.data : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  private writeConsentCookie(record: PrivacyConsent): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      const encoded = encodeURIComponent(JSON.stringify(record));
      const secureFlag = globalThis.location?.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${CONSENT_COOKIE_NAME}=${encoded}; Path=/; Max-Age=${CONSENT_MAX_AGE_SEC}; SameSite=Lax${secureFlag}`;
    } catch {
      return;
    }
  }

  private openBroadcastChannel(): BroadcastChannel | null {
    if (!this.isBrowser || typeof BroadcastChannel !== 'function') {
      return null;
    }
    try {
      const ch = new BroadcastChannel(CONSENT_CHANNEL_NAME);
      ch.addEventListener('message', (event: MessageEvent<unknown>) => {
        const parsed = PrivacyConsentSchema.safeParse(event.data);
        if (parsed.success) {
          this.consentSignal.set(parsed.data);
        }
      });
      return ch;
    } catch {
      return null;
    }
  }
}
