import { isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { type ScenarioId, ScenarioIdSchema } from '@pokeverse/shared';
import { PrivacyConsentStore } from './privacy-consent.store';
import { QualityStore } from './quality.store';

export { ScenarioIdSchema, type ScenarioId } from '@pokeverse/shared';

export interface ScenarioDefinition {
  readonly id: ScenarioId;
  readonly label: string;
  readonly desktopSrc: string;
  readonly mobileSrc: string;
}

export const SCENARIOS_CATALOG: readonly ScenarioDefinition[] = [
  {
    id: 'hoenn',
    label: 'Hoenn',
    desktopSrc: '/assets/backgrounds/mirante-hoenn-desktop.webp',
    mobileSrc: '/assets/backgrounds/mirante-hoenn-mobile.webp',
  },
  {
    id: 'cidade',
    label: 'Cidade',
    desktopSrc: '/assets/backgrounds/cidade-anime-desktop.webp',
    mobileSrc: '/assets/backgrounds/cidade-anime-mobile.webp',
  },
  {
    id: 'vila',
    label: 'Vila',
    desktopSrc: '/assets/backgrounds/vila-pallet-desktop.webp',
    mobileSrc: '/assets/backgrounds/vila-pallet-mobile.webp',
  },
  {
    id: 'floresta',
    label: 'Floresta',
    desktopSrc: '/assets/backgrounds/floresta-sol-desktop.webp',
    mobileSrc: '/assets/backgrounds/floresta-sol-mobile.webp',
  },
];

const SCENARIO_ROTATION_MS = 12000;
const INACTIVE_CLEANUP_MS = 960;
const STORAGE_SCENARIO_KEY = 'pokedex_cenario_ativo';
const STORAGE_AUTO_KEY = 'pokedex_cenario_auto';

@Injectable({ providedIn: 'root' })
export class ScenarioStore implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly quality = inject(QualityStore);
  private readonly privacy = inject(PrivacyConsentStore);

  private readonly activeScenarioSignal = signal<ScenarioId>(this.loadInitialScenario());
  private readonly autoEnabledSignal = signal<boolean>(this.loadInitialAuto());
  private readonly transitioningToCleanupSignal = signal(false);

  readonly scenarios = SCENARIOS_CATALOG;
  readonly activeScenario = this.activeScenarioSignal.asReadonly();
  readonly activeScenarioLabel = computed(
    () =>
      SCENARIOS_CATALOG.find((item) => item.id === this.activeScenarioSignal())?.label ?? 'Hoenn',
  );
  readonly autoEnabled = this.autoEnabledSignal.asReadonly();
  readonly keepInactiveAttached = this.transitioningToCleanupSignal.asReadonly();

  private rotationTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onVisibilityChange = () => {
    this.syncRotationTimer();
  };

  constructor() {
    if (this.isBrowser) {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      this.syncRotationTimer();
    }
  }

  selectScenario(id: ScenarioId, manualInteraction = true): void {
    const parsed = ScenarioIdSchema.safeParse(id);
    const validId: ScenarioId = parsed.success ? parsed.data : 'hoenn';
    this.activeScenarioSignal.set(validId);
    this.saveStorage(STORAGE_SCENARIO_KEY, validId);
    this.scheduleInactiveCleanup();

    if (manualInteraction) {
      this.setAutoEnabled(false);
    }
  }

  cycleScenario(): void {
    this.setAutoEnabled(false);
    this.advanceNextScenario();
  }

  toggleAuto(): void {
    const next = !this.autoEnabledSignal();
    this.setAutoEnabled(next);
    if (next) {
      this.advanceNextScenario();
    }
  }

  setAutoEnabled(enabled: boolean): void {
    this.autoEnabledSignal.set(enabled);
    this.saveStorage(STORAGE_AUTO_KEY, String(enabled));
    this.syncRotationTimer();
  }

  private advanceNextScenario(): void {
    if (this.isBrowser && document.hidden) {
      return;
    }
    const ids = SCENARIOS_CATALOG.map((item) => item.id);
    const currentIdx = ids.indexOf(this.activeScenarioSignal());
    const nextId = ids[(currentIdx + 1) % ids.length] ?? 'hoenn';
    this.activeScenarioSignal.set(nextId);
    this.saveStorage(STORAGE_SCENARIO_KEY, nextId);
    this.scheduleInactiveCleanup();
  }

  private syncRotationTimer(): void {
    if (this.rotationTimer !== null) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
    if (!this.isBrowser || !this.autoEnabledSignal() || document.hidden) {
      return;
    }
    this.rotationTimer = setInterval(() => {
      this.advanceNextScenario();
    }, SCENARIO_ROTATION_MS);
  }

  private scheduleInactiveCleanup(): void {
    if (this.cleanupTimer !== null) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.quality.tier() === 'ultra') {
      this.transitioningToCleanupSignal.set(true);
      return;
    }
    this.transitioningToCleanupSignal.set(true);
    this.cleanupTimer = setTimeout(() => {
      this.transitioningToCleanupSignal.set(false);
      this.cleanupTimer = null;
    }, INACTIVE_CLEANUP_MS);
  }

  private loadInitialScenario(): ScenarioId {
    if (!this.isBrowser || !this.privacy.canPersistFunctionalPreferences()) {
      return 'hoenn';
    }
    try {
      const saved = window.localStorage.getItem(STORAGE_SCENARIO_KEY);
      const parsed = ScenarioIdSchema.safeParse(saved);
      return parsed.success ? parsed.data : 'hoenn';
    } catch {
      return 'hoenn';
    }
  }

  private loadInitialAuto(): boolean {
    if (!this.isBrowser) {
      return true;
    }
    if (!this.privacy.canPersistFunctionalPreferences()) {
      return !this.quality.reducedMotion() && this.quality.tier() !== 'lite';
    }
    try {
      const saved = window.localStorage.getItem(STORAGE_AUTO_KEY);
      if (saved === 'true' || saved === 'false') {
        return saved === 'true';
      }
    } catch {
      return !this.quality.reducedMotion() && this.quality.tier() !== 'lite';
    }
    return !this.quality.reducedMotion() && this.quality.tier() !== 'lite';
  }

  private saveStorage(key: string, value: string): void {
    if (!this.isBrowser || !this.privacy.canPersistFunctionalPreferences()) {
      return;
    }
    try {
      window.localStorage.setItem(key, value);
    } catch {
      return;
    }
  }

  ngOnDestroy(): void {
    if (this.rotationTimer !== null) {
      clearInterval(this.rotationTimer);
    }
    if (this.cleanupTimer !== null) {
      clearTimeout(this.cleanupTimer);
    }
    if (this.isBrowser) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }
}
