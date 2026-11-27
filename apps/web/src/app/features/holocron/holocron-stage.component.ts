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
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { AudioEngineService } from '../../core/audio/audio-engine.service';
import { QualityStore } from '../../core/stores/quality.store';
import type { PokemonDetailView } from '../pokedex-device/services/pokedex-view-mapper.util';
import type { HolocronMediaState } from './holocron-animation.util';
import { resolveHolocronTextures, resolvePokemonGlbCandidates } from './holocron-palette.util';
import type { HolocronSceneController } from './holocron-three.renderer';
import { HolocronStore } from './holocron.store';

@Component({
  selector: 'pv-holocron-stage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './holocron-stage.component.html',
  styleUrl: './holocron-stage.component.scss',
})
export class HolocronStageComponent implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly quality = inject(QualityStore);
  private readonly audioEngine = inject(AudioEngineService);
  private readonly holocron = inject(HolocronStore);

  readonly pokemon = input.required<PokemonDetailView>();
  readonly shiny = input.required<boolean>();
  readonly autoRotate = input.required<boolean>();
  readonly compact = input<boolean>(false);

  readonly toggleShiny = output<void>();
  readonly toggleAutoRotate = output<void>();

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('glCanvas');
  readonly initFailed = signal(false);
  readonly fallbackImageFailed = signal(false);
  readonly mediaState = signal<HolocronMediaState>({
    kind: 'loading',
    animations: [],
    activeAnimationIndex: -1,
  });

  private controller: HolocronSceneController | null = null;
  private mounting = false;
  private disposed = false;

  readonly textures = computed(() => resolveHolocronTextures(this.pokemon(), this.shiny()));
  readonly spriteUrl = computed(() => this.textures().frontUrl);
  readonly glbCandidates = computed(() =>
    resolvePokemonGlbCandidates(this.pokemon().id, this.shiny()),
  );

  readonly canUseWebGl = computed(
    () =>
      this.isBrowser &&
      this.quality.tier() !== 'lite' &&
      this.quality.profile().webgl2Supported &&
      !this.holocron.webglLost() &&
      !this.initFailed(),
  );

  readonly renderModeLabel = computed(() => {
    if (this.holocron.webglLost()) return 'Modo 2D · Fallback';
    if (this.quality.tier() === 'lite') return 'Modo 2D · LITE';
    if (!this.canUseWebGl()) return 'Modo 2D · Fallback';
    const suffix = this.quality.tier() === 'ultra' ? 'ULTRA' : 'EQUIL.';
    const kind = this.mediaState().kind;
    if (kind === 'loading') return 'Carregando 3D...';
    if (kind === 'glb-animated') return `3D Animado · ${suffix}`;
    if (kind === 'glb-procedural') return `Modelo 3D · ${suffix}`;
    return `Prisma 3D · ${suffix}`;
  });

  constructor() {
    effect(() => {
      this.pokemon();
      this.shiny();
      this.fallbackImageFailed.set(false);
    });

    effect(() => {
      const useGl = this.canUseWebGl();
      const canvas = this.canvasRef()?.nativeElement;
      if (!useGl || !canvas) {
        untracked(() => this.disposeController());
        return;
      }
      if (!this.controller && !this.mounting) {
        untracked(() => void this.mountScene(canvas));
      }
    });

    effect(() => {
      const pk = this.pokemon();
      this.controller?.updatePokemon(this.textures(), this.glbCandidates(), pk.types);
    });

    effect(() => {
      this.controller?.setAutoRotate(this.autoRotate());
      this.controller?.setReducedMotion(this.quality.reducedMotion());
    });
  }

  onNudge(delta: number): void {
    this.controller?.nudgeOrbit(delta);
  }

  onResetCamera(): void {
    this.controller?.resetCamera();
  }

  onSelectAnimation(index: number): void {
    this.mediaState.update((prev) => ({ ...prev, activeAnimationIndex: index }));
    this.controller?.selectAnimation(index);
  }

  onFallbackSpriteError(): void {
    this.fallbackImageFailed.set(true);
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.disposeController();
  }

  private async mountScene(canvas: HTMLCanvasElement): Promise<void> {
    this.mounting = true;
    try {
      const mod = await import('./holocron-three.renderer');
      if (this.disposed || !this.canUseWebGl()) return;
      const pk = this.pokemon();
      this.controller = mod.mountHolocronThreeScene({
        canvas,
        tier: this.quality.tier(),
        reducedMotion: this.quality.reducedMotion(),
        autoRotate: this.autoRotate(),
        textures: this.textures(),
        glbCandidates: this.glbCandidates(),
        types: pk.types,
        readEnergy: (t) => this.audioEngine.readEnergyLevel(t),
        onMediaStateChange: (next) => {
          if (!this.disposed) this.mediaState.set(next);
        },
        onContextLost: () => {
          this.disposeController();
          this.holocron.markWebGlLost();
        },
        onLowFps: () => this.quality.downgradeAutoTier(),
      });
    } catch {
      this.initFailed.set(true);
    } finally {
      this.mounting = false;
    }
  }

  private disposeController(): void {
    if (this.controller) {
      this.controller.dispose();
      this.controller = null;
    }
  }
}
