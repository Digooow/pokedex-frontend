import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  HardwareProfileSchema,
  type HardwareProfile,
  type HardwareTier,
  type PerfPreference,
} from '@pokeverse/shared';
import { z } from 'zod';

const PERF_STORAGE_KEY = 'pokeverse_perf_pref';
const PERF_CYCLE: readonly PerfPreference[] = ['auto', 'ultra', 'balanced', 'lite'];
const PreferenceSchema = z.enum(['auto', 'ultra', 'balanced', 'lite']);

interface NavigatorWithCapabilities extends Navigator {
  readonly deviceMemory?: number;
  readonly connection?: { readonly saveData?: boolean; readonly effectiveType?: string };
}

/** Detects client hardware capabilities once at boot without blocking rendering. */
@Injectable({ providedIn: 'root' })
export class QualityStore {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly profileSignal = signal<HardwareProfile>(this.detectInitialProfile());

  readonly profile = this.profileSignal.asReadonly();
  readonly tier = computed<HardwareTier>(() => this.profileSignal().tier);
  readonly preference = computed<PerfPreference>(() => this.profileSignal().preference);
  readonly reducedMotion = computed(() => this.profileSignal().reducedMotion);
  readonly coarsePointer = computed(() => this.profileSignal().coarsePointer);

  readonly badgeLabel = computed(() => {
    const current = this.profileSignal();
    const names: Record<HardwareTier, string> = {
      ultra: 'Ultra',
      balanced: 'Equil.',
      lite: 'Lite',
    };
    return current.preference === 'auto'
      ? `Perf: Auto (${names[current.tier]})`
      : `Perf: ${names[current.tier]}`;
  });

  constructor() {
    effect(() => {
      if (!this.isBrowser) {
        return;
      }
      document.documentElement.dataset['perfTier'] = this.profileSignal().tier;
    });
  }

  setPreference(preference: PerfPreference): void {
    const nextTier = this.resolveTier(preference, this.profileSignal());
    const next = HardwareProfileSchema.parse({
      ...this.profileSignal(),
      preference,
      tier: nextTier,
    });
    this.profileSignal.set(next);
    this.persistPreference(preference);
  }

  cyclePreference(): void {
    const currentIdx = PERF_CYCLE.indexOf(this.profileSignal().preference);
    const next = PERF_CYCLE[(currentIdx + 1) % PERF_CYCLE.length] ?? 'auto';
    this.setPreference(next);
  }

  /** Step down auto tier when 3D hinge animation drops frames under frame budget. */
  downgradeAutoTier(): void {
    const current = this.profileSignal();
    if (current.preference !== 'auto' || current.tier === 'lite') {
      return;
    }
    const nextTier: HardwareTier = current.tier === 'ultra' ? 'balanced' : 'lite';
    this.profileSignal.set(
      HardwareProfileSchema.parse({
        ...current,
        tier: nextTier,
      }),
    );
  }

  private detectInitialProfile(): HardwareProfile {
    if (!this.isBrowser) {
      return HardwareProfileSchema.parse({
        tier: 'balanced',
        preference: 'auto',
        reducedMotion: false,
        coarsePointer: false,
        webgl2Supported: false,
        saveData: false,
        deviceMemoryGb: null,
        hardwareConcurrency: null,
      });
    }

    const nav = navigator as NavigatorWithCapabilities;
    const match = (query: string) =>
      typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false;
    const reducedMotion = match('(prefers-reduced-motion: reduce)');
    const coarsePointer = match('(pointer: coarse)');
    const saveData = Boolean(nav.connection?.saveData);
    const deviceMemoryGb =
      typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 ? nav.deviceMemory : null;
    const hardwareConcurrency =
      typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0
        ? Math.floor(nav.hardwareConcurrency)
        : null;
    const webgl2Supported = this.probeWebGl2();
    const preference = this.loadPreference();

    const base = {
      preference,
      reducedMotion,
      coarsePointer,
      webgl2Supported,
      saveData,
      deviceMemoryGb,
      hardwareConcurrency,
    };

    return HardwareProfileSchema.parse({
      ...base,
      tier: this.resolveTier(preference, base),
    });
  }

  private resolveTier(
    preference: PerfPreference,
    probe: Omit<HardwareProfile, 'tier'>,
  ): HardwareTier {
    if (preference !== 'auto') {
      return preference;
    }
    if (
      probe.reducedMotion ||
      probe.saveData ||
      !probe.webgl2Supported ||
      (probe.deviceMemoryGb !== null && probe.deviceMemoryGb <= 2)
    ) {
      return 'lite';
    }
    if (
      probe.coarsePointer ||
      (probe.hardwareConcurrency !== null && probe.hardwareConcurrency <= 4) ||
      (probe.deviceMemoryGb !== null && probe.deviceMemoryGb <= 4)
    ) {
      return 'balanced';
    }
    return 'ultra';
  }

  private probeWebGl2(): boolean {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('webgl2');
      if (!ctx) {
        return false;
      }
      ctx.getExtension('WEBGL_lose_context')?.loseContext();
      return true;
    } catch {
      return false;
    }
  }

  private loadPreference(): PerfPreference {
    try {
      const raw = window.localStorage.getItem(PERF_STORAGE_KEY);
      const parsed = PreferenceSchema.safeParse(raw);
      return parsed.success ? parsed.data : 'auto';
    } catch {
      return 'auto';
    }
  }

  private persistPreference(preference: PerfPreference): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      window.localStorage.setItem(PERF_STORAGE_KEY, preference);
    } catch {
      /* Ignore storage quota errors in restricted browsing modes */
    }
  }
}
