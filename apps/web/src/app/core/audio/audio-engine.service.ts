import { isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { AudioStore, type CryPlaybackKind } from '../stores/audio.store';
import { QualityStore } from '../stores/quality.store';

export type UiToneKind = 'click' | 'confirm' | 'hinge-open' | 'hinge-close' | 'holocron';

interface ToneProfile {
  readonly startHz: number;
  readonly endHz: number;
  readonly durationSec: number;
  readonly peakGain: number;
  readonly wave: OscillatorType;
}

const UI_TONE_PROFILES: Readonly<Record<UiToneKind, ToneProfile>> = {
  click: { startHz: 660, endHz: 880, durationSec: 0.045, peakGain: 0.035, wave: 'triangle' },
  confirm: { startHz: 520, endHz: 780, durationSec: 0.08, peakGain: 0.045, wave: 'sine' },
  'hinge-open': { startHz: 240, endHz: 520, durationSec: 0.11, peakGain: 0.045, wave: 'sine' },
  'hinge-close': { startHz: 460, endHz: 210, durationSec: 0.1, peakGain: 0.04, wave: 'sine' },
  holocron: { startHz: 420, endHz: 960, durationSec: 0.12, peakGain: 0.05, wave: 'triangle' },
};

const REST_BAR_LEVEL = 0.08;

@Injectable({ providedIn: 'root' })
export class AudioEngineService implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly audioStore = inject(AudioStore);
  private readonly quality = inject(QualityStore);

  private audioCtx: AudioContext | null = null;
  private activeAudio: HTMLAudioElement | null = null;
  private activeCryUrl: string | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private frequencyBuffer: Uint8Array<ArrayBuffer> | null = null;

  playCry(kind: CryPlaybackKind, url: string | null): void {
    if (!this.isBrowser || !url || typeof Audio === 'undefined') {
      this.audioStore.setCryPlaybackState(null, 'Áudio indisponível neste dispositivo.');
      return;
    }
    if (this.audioStore.muted()) {
      this.stopCry();
      this.audioStore.setCryPlaybackState(null, 'Áudio silenciado em Configurações.');
      return;
    }

    const wasSame = this.audioStore.activeCryKind() === kind && this.activeCryUrl === url;
    this.stopCry();
    if (wasSame) return;

    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    this.activeAudio = audio;
    this.activeCryUrl = url;
    this.audioStore.setCryPlaybackState(kind, null);
    this.attachAnalyser(audio);

    audio.onended = () => {
      if (this.activeAudio === audio) this.stopCry();
    };
    audio.onerror = () => {
      if (this.activeAudio !== audio) return;
      this.stopCry();
      this.audioStore.setCryPlaybackState(
        null,
        'Não foi possível reproduzir o áudio deste Pokémon.',
      );
    };

    Promise.resolve(audio.play()).catch(() => {
      if (this.activeAudio !== audio) return;
      this.stopCry();
      this.audioStore.setCryPlaybackState(null, 'Reprodução bloqueada pelo navegador.');
    });
  }

  stopCry(): void {
    if (this.activeAudio) {
      this.activeAudio.onended = null;
      this.activeAudio.onerror = null;
      this.activeAudio.pause();
      this.activeAudio = null;
    }
    this.activeCryUrl = null;
    this.disconnectCryGraph();
    this.audioStore.setCryPlaybackState(null, null);
  }

  readFrequencyLevels(barCount: number, elapsedMs: number): number[] {
    const safeCount = Math.max(1, barCount);
    const activeKind = this.audioStore.activeCryKind();
    if (!activeKind) {
      return Array.from({ length: safeCount }, () => REST_BAR_LEVEL);
    }

    const live = this.readAnalyserBins(safeCount);
    if (live) return live;

    const t = elapsedMs * 0.008;
    const speedFactor = activeKind === 'legacy' ? 1.45 : 1;
    return Array.from({ length: safeCount }, (_, index) => {
      const phase = index * 0.65 + t * speedFactor;
      const harmonic = Math.abs(Math.sin(phase) * 0.55 + Math.cos(phase * 1.7) * 0.35);
      return Math.min(1, Math.max(0.14, harmonic));
    });
  }

  readEnergyLevel(elapsedMs: number): number {
    if (!this.audioStore.activeCryKind()) return 0;
    const levels = this.readFrequencyLevels(8, elapsedMs);
    const sum = levels.reduce((acc, value) => acc + value, 0);
    return Math.min(1, sum / levels.length);
  }

  playUiTone(kind: UiToneKind): void {
    if (
      !this.isBrowser ||
      this.audioStore.muted() ||
      !this.audioStore.sfxEnabled() ||
      this.quality.tier() === 'lite' ||
      this.quality.reducedMotion()
    ) {
      return;
    }

    const ctx = this.ensureAudioContext();
    if (!ctx) return;

    const profile = UI_TONE_PROFILES[kind];
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = profile.wave;
      osc.frequency.setValueAtTime(profile.startHz, now);
      osc.frequency.exponentialRampToValueAtTime(profile.endHz, now + profile.durationSec);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(profile.peakGain, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.durationSec);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + profile.durationSec + 0.01);
    } catch {
      return;
    }
  }

  ngOnDestroy(): void {
    this.stopCry();
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => undefined);
      this.audioCtx = null;
    }
  }

  private ensureAudioContext(): AudioContext | null {
    if (!this.isBrowser) return null;
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume().catch(() => undefined);
      }
      return this.audioCtx;
    }
    const Ctor =
      globalThis.AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (typeof Ctor !== 'function') return null;
    try {
      this.audioCtx = new Ctor();
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  private attachAnalyser(audio: HTMLAudioElement): void {
    const ctx = this.ensureAudioContext();
    if (!ctx || typeof ctx.createMediaElementSource !== 'function') return;
    try {
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.78;
      const gain = ctx.createGain();
      gain.gain.value = 1;
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(ctx.destination);
      this.mediaSource = source;
      this.analyser = analyser;
      this.gainNode = gain;
      this.frequencyBuffer = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    } catch {
      this.disconnectCryGraph();
    }
  }

  private readAnalyserBins(barCount: number): number[] | null {
    if (!this.analyser || !this.frequencyBuffer) return null;
    this.analyser.getByteFrequencyData(this.frequencyBuffer);
    const binLen = this.frequencyBuffer.length;
    if (binLen === 0) return null;
    const step = Math.max(1, Math.floor(binLen / barCount));
    const levels: number[] = [];
    let totalEnergy = 0;

    for (let i = 0; i < barCount; i += 1) {
      const raw = this.frequencyBuffer[Math.min(binLen - 1, i * step)] ?? 0;
      const normalized = Math.max(REST_BAR_LEVEL, raw / 255);
      totalEnergy += raw;
      levels.push(normalized);
    }

    return totalEnergy > 0 ? levels : null;
  }

  private disconnectCryGraph(): void {
    try {
      this.mediaSource?.disconnect();
      this.analyser?.disconnect();
      this.gainNode?.disconnect();
    } catch {
      return;
    } finally {
      this.mediaSource = null;
      this.analyser = null;
      this.gainNode = null;
      this.frequencyBuffer = null;
    }
  }
}
