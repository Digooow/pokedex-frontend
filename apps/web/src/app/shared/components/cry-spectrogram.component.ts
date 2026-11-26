import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { AudioEngineService } from '../../core/audio/audio-engine.service';
import { QualityStore } from '../../core/stores/quality.store';

const DEFAULT_BAR_COUNT = 18;
const COMPACT_BAR_COUNT = 14;

@Component({
  selector: 'pv-cry-spectrogram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="cry-spec"
      [class.cry-spec--compact]="compact()"
      [class.is-active]="active()"
      role="status"
      aria-live="polite"
      [attr.aria-label]="label()"
    >
      <canvas
        #specCanvas
        class="cry-spec__canvas"
        width="240"
        height="44"
        aria-hidden="true"
      ></canvas>
      <span class="cry-spec__caption">
        {{ active() ? 'Espectro ativo' : 'Pronto para análise acústica' }}
      </span>
    </div>
  `,
  styleUrl: './cry-spectrogram.component.scss',
})
export class CrySpectrogramComponent implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly audioEngine = inject(AudioEngineService);
  private readonly quality = inject(QualityStore);

  readonly active = input<boolean>(false);
  readonly label = input<string>('Analisador de espectro acústico');
  readonly compact = input<boolean>(false);

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('specCanvas');
  readonly isStaticMode = computed(
    () => this.quality.tier() === 'lite' || this.quality.reducedMotion(),
  );

  private rafId: number | null = null;
  private startMs = 0;

  constructor() {
    effect(() => {
      const active = this.active();
      const staticMode = this.isStaticMode();
      const canvas = this.canvasRef()?.nativeElement;
      this.stopLoop();
      if (!this.isBrowser || !canvas) return;
      if (!active || staticMode) {
        this.drawFrame(canvas, active ? 320 : 0);
        return;
      }
      this.startMs = performance.now();
      const tick = (now: number) => {
        this.drawFrame(canvas, now - this.startMs);
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    });
  }

  ngOnDestroy(): void {
    this.stopLoop();
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private drawFrame(canvas: HTMLCanvasElement, elapsedMs: number): void {
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      return;
    }
    if (!ctx) return;

    const styles = getComputedStyle(canvas);
    const lowColor = styles.getPropertyValue('--pv-audio-bar-low').trim() || 'currentColor';
    const midColor = styles.getPropertyValue('--pv-audio-bar-mid').trim() || lowColor;
    const peakColor = styles.getPropertyValue('--pv-audio-bar-peak').trim() || midColor;

    const count = this.compact() ? COMPACT_BAR_COUNT : DEFAULT_BAR_COUNT;
    const levels = this.audioEngine.readFrequencyLevels(count, elapsedMs);
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const gap = 3;
    const barWidth = Math.max(4, Math.floor((width - gap * (count + 1)) / count));
    const maxBarHeight = Math.max(8, height - 8);

    for (let i = 0; i < levels.length; i += 1) {
      const level = levels[i] ?? 0.08;
      const barHeight = Math.max(3, Math.round(level * maxBarHeight));
      const x = gap + i * (barWidth + gap);
      const y = height - 4 - barHeight;
      ctx.fillStyle = this.resolveBarColor(level, lowColor, midColor, peakColor);
      ctx.fillRect(x, y, barWidth, barHeight);
    }
  }

  private resolveBarColor(
    level: number,
    lowColor: string,
    midColor: string,
    peakColor: string,
  ): string {
    if (level > 0.72) return peakColor;
    if (level > 0.42) return midColor;
    return lowColor;
  }
}
