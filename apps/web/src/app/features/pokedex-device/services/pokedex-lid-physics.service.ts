import { isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import { QualityStore } from '../../../core/stores/quality.store';
import { PokedexStore } from './pokedex.store';

const DURACAO_GIRO_POKEDEX_MS = 1260;
const FRAME_BUDGET_REBAIXE_MS = 30;
const MIN_FRAMES_WATCHDOG = 6;

@Injectable({ providedIn: 'root' })
export class PokedexLidPhysicsService implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly quality = inject(QualityStore);
  private readonly pokedex = inject(PokedexStore);

  private hostEl: HTMLElement | null = null;
  private flipStartRafId = 0;
  private flipTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogRafId = 0;
  private glintRafId = 0;
  private pendingGlintX = 28;
  private pendingGlintY = 20;
  private pendingTargetOpen: boolean | null = null;

  readonly isAnimating = signal(false);
  readonly isTransitioning = signal(false);
  readonly luzActive = signal(false);
  readonly luzX = signal('28%');
  readonly luzY = signal('20%');

  attachHost(element: HTMLElement): void {
    this.hostEl = element;
  }

  isDesiredOpen(): boolean {
    if (this.isAnimating() && this.pendingTargetOpen !== null) {
      return this.pendingTargetOpen;
    }
    return this.pokedex.coverOpen();
  }

  onPointerMove(event: PointerEvent, deviceEl: HTMLElement): void {
    if (
      !this.isBrowser ||
      this.isAnimating() ||
      this.quality.reducedMotion() ||
      this.quality.tier() === 'lite' ||
      window.matchMedia?.('(hover: hover)')?.matches === false
    ) {
      return;
    }

    const rect = deviceEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const pctX = ((event.clientX - rect.left) / rect.width) * 100;
    const pctY = ((event.clientY - rect.top) / rect.height) * 100;
    this.pendingGlintX = Math.max(8, Math.min(92, pctX));
    this.pendingGlintY = Math.max(8, Math.min(92, pctY));
    this.luzActive.set(true);

    if (!this.glintRafId && typeof requestAnimationFrame === 'function') {
      this.glintRafId = requestAnimationFrame(() => {
        this.glintRafId = 0;
        this.luzX.set(`${this.pendingGlintX.toFixed(1)}%`);
        this.luzY.set(`${this.pendingGlintY.toFixed(1)}%`);
      });
    }
  }

  resetGlint(): void {
    if (this.glintRafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.glintRafId);
      this.glintRafId = 0;
    }
    this.luzActive.set(false);
    this.luzX.set('28%');
    this.luzY.set('20%');
  }

  runLidTransition(open: boolean, onComplete?: () => void): void {
    const wasTransitioning = this.isAnimating() && this.isTransitioning();
    this.clearTimers();
    this.stopWatchdog();
    this.pendingTargetOpen = open;

    const host = this.hostEl;
    const skipMotion = this.quality.reducedMotion() || this.quality.tier() === 'lite';
    if (skipMotion || !host) {
      host?.classList.remove('is-transicionando', 'is-animando');
      this.pendingTargetOpen = null;
      this.isTransitioning.set(false);
      this.isAnimating.set(false);
      this.pokedex.setCoverOpen(open);
      onComplete?.();
      return;
    }

    const scheduleCompletion = () => {
      this.startWatchdog();
      this.flipTimer = setTimeout(() => {
        this.flipTimer = null;
        this.stopWatchdog();
        this.pendingTargetOpen = null;
        host.classList.remove('is-transicionando', 'is-animando');
        this.isTransitioning.set(false);
        this.isAnimating.set(false);
        onComplete?.();
      }, DURACAO_GIRO_POKEDEX_MS);
    };

    if (wasTransitioning) {
      host.getBoundingClientRect();
      this.pokedex.setCoverOpen(open);
      scheduleCompletion();
      return;
    }

    host.classList.remove('is-transicionando');
    host.classList.add('is-animando');
    this.isTransitioning.set(false);
    this.isAnimating.set(true);
    host.getBoundingClientRect();

    const scheduleNextFrame =
      typeof requestAnimationFrame === 'function'
        ? (cb: () => void) => requestAnimationFrame(cb)
        : (cb: () => void) => setTimeout(cb, 0) as unknown as number;

    this.flipStartRafId = scheduleNextFrame(() => {
      this.flipStartRafId = 0;
      const target = this.pendingTargetOpen ?? open;
      host.classList.add('is-transicionando');
      host.getBoundingClientRect();
      this.isTransitioning.set(true);
      this.pokedex.setCoverOpen(target);
      scheduleCompletion();
    });
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    if (
      !this.isBrowser ||
      this.quality.preference() !== 'auto' ||
      this.quality.tier() === 'lite' ||
      typeof requestAnimationFrame !== 'function'
    ) {
      return;
    }

    let lastTime = performance.now();
    let frameCount = 0;
    let deltaSum = 0;

    const sample = (now: number) => {
      this.watchdogRafId = 0;
      if (!this.isAnimating() || document.hidden) {
        return;
      }
      const delta = now - lastTime;
      lastTime = now;
      if (delta > 0 && delta < 250) {
        frameCount += 1;
        deltaSum += delta;
      }
      if (frameCount >= MIN_FRAMES_WATCHDOG && deltaSum / frameCount > FRAME_BUDGET_REBAIXE_MS) {
        this.quality.downgradeAutoTier();
        return;
      }
      this.watchdogRafId = requestAnimationFrame(sample);
    };

    this.watchdogRafId = requestAnimationFrame(sample);
  }

  private stopWatchdog(): void {
    if (this.watchdogRafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.watchdogRafId);
      this.watchdogRafId = 0;
    }
  }

  private clearTimers(): void {
    if (this.flipStartRafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.flipStartRafId);
      this.flipStartRafId = 0;
    }
    if (this.flipTimer !== null) {
      clearTimeout(this.flipTimer);
      this.flipTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.clearTimers();
    this.stopWatchdog();
    if (this.glintRafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.glintRafId);
      this.glintRafId = 0;
    }
  }
}
