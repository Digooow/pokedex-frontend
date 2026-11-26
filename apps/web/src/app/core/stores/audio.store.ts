import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { PrivacyConsentStore } from './privacy-consent.store';

export const AUDIO_MUTED_STORAGE_KEY = 'pokeverse_audio_muted';
export const AUDIO_SFX_STORAGE_KEY = 'pokeverse_audio_sfx';

export type CryPlaybackKind = 'latest' | 'legacy';

@Injectable({ providedIn: 'root' })
export class AudioStore {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly privacy = inject(PrivacyConsentStore);

  private readonly mutedSignal = signal(false);
  private readonly sfxEnabledSignal = signal(true);
  private readonly activeCryKindSignal = signal<CryPlaybackKind | null>(null);
  private readonly cryErrorSignal = signal<string | null>(null);

  readonly muted = this.mutedSignal.asReadonly();
  readonly sfxEnabled = this.sfxEnabledSignal.asReadonly();
  readonly activeCryKind = this.activeCryKindSignal.asReadonly();
  readonly cryError = this.cryErrorSignal.asReadonly();

  constructor() {
    this.privacy.registerNonEssentialStorageKey(AUDIO_MUTED_STORAGE_KEY, AUDIO_SFX_STORAGE_KEY);
    this.mutedSignal.set(this.readBooleanFlag(AUDIO_MUTED_STORAGE_KEY, false));
    this.sfxEnabledSignal.set(this.readBooleanFlag(AUDIO_SFX_STORAGE_KEY, true));
  }

  toggleMute(): void {
    this.setMuted(!this.mutedSignal());
  }

  setMuted(value: boolean): void {
    this.mutedSignal.set(value);
    this.persistBooleanFlag(AUDIO_MUTED_STORAGE_KEY, value);
  }

  toggleSfx(): void {
    this.setSfxEnabled(!this.sfxEnabledSignal());
  }

  setSfxEnabled(value: boolean): void {
    this.sfxEnabledSignal.set(value);
    this.persistBooleanFlag(AUDIO_SFX_STORAGE_KEY, value);
  }

  setCryPlaybackState(kind: CryPlaybackKind | null, error: string | null = null): void {
    this.activeCryKindSignal.set(kind);
    this.cryErrorSignal.set(error);
  }

  private readBooleanFlag(key: string, fallback: boolean): boolean {
    if (!this.isBrowser || !this.privacy.canPersistFunctionalPreferences()) {
      return fallback;
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return fallback;
    } catch {
      return fallback;
    }
  }

  private persistBooleanFlag(key: string, value: boolean): void {
    if (!this.isBrowser || !this.privacy.canPersistFunctionalPreferences()) {
      return;
    }
    try {
      window.localStorage.setItem(key, value ? 'true' : 'false');
    } catch {
      return;
    }
  }
}
