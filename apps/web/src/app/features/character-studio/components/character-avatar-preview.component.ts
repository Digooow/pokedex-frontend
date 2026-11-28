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
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  type CharacterAppearance,
  type CharacterOriginKey,
  getCharacterBodyModelMeta,
  getCharacterOriginByKey,
} from '@pokeverse/shared';
import {
  CHARACTER_HOLOGRAM_MOUNTER,
  type CharacterHologramMediaState,
  type CharacterHologramSceneController,
} from '../../../core/engine-ports/avatar-stage.port';
import { QualityStore } from '../../../core/stores/quality.store';

@Component({
  selector: 'pv-character-avatar-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './character-avatar-preview.component.html',
  styleUrl: './character-avatar-preview.component.scss',
})
export class CharacterAvatarPreviewComponent implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly quality = inject(QualityStore);
  private readonly loadSceneMounter = inject(CHARACTER_HOLOGRAM_MOUNTER);

  readonly appearance = input.required<CharacterAppearance>();
  readonly displayName = input<string>('Viajante');
  readonly originKey = input<CharacterOriginKey>('settler');
  readonly archetypeLabel = input<string>('Viajante Livre');
  readonly compact = input<boolean>(false);

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('glCanvas');
  readonly autoRotate = signal(true);
  readonly webglLost = signal(false);
  readonly initFailed = signal(false);
  readonly mediaState = signal<CharacterHologramMediaState>({
    kind: 'loading',
    animations: [],
    activeAnimationIndex: -1,
  });

  private controller: CharacterHologramSceneController | null = null;
  private mounting = false;
  private disposed = false;

  readonly bodyModel = computed(() => this.appearance().bodyModel ?? 'male');
  readonly bodyMeta = computed(() => getCharacterBodyModelMeta(this.bodyModel()));
  readonly origin = computed(() => getCharacterOriginByKey(this.originKey()));
  readonly resolvedName = computed(() => this.displayName().trim() || 'Viajante Sem Classe');

  readonly visibleClips = computed(() => {
    const clips = this.mediaState().animations;
    if (clips.length <= 5) return clips;
    const preferred = ['idle', 'walk', 'run', 'wave', 'sword'];
    const picked = clips.filter((clip) =>
      preferred.some((hint) => clip.label.toLowerCase().includes(hint)),
    );
    return picked.length >= 2 ? picked.slice(0, 5) : clips.slice(0, 5);
  });

  readonly canUseWebGl = computed(
    () =>
      this.isBrowser &&
      this.quality.tier() !== 'lite' &&
      this.quality.profile().webgl2Supported &&
      !this.webglLost() &&
      !this.initFailed(),
  );

  readonly renderModeLabel = computed(() => {
    if (this.webglLost()) return 'Holograma 2D · Fallback';
    if (this.quality.tier() === 'lite' || !this.canUseWebGl()) return 'Holograma 2D · LITE';
    const suffix = this.quality.tier() === 'ultra' ? 'ULTRA' : 'EQUIL.';
    const kind = this.mediaState().kind;
    if (kind === 'loading') return 'Carregando 3D...';
    if (kind === 'glb-animated') return `Holograma 3D · ${suffix}`;
    return `Modelo 3D · ${suffix}`;
  });

  constructor() {
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
      this.controller?.setBodyModel(this.bodyModel());
    });

    effect(() => {
      this.controller?.setOriginKey(this.originKey());
    });

    effect(() => {
      const rotate = this.autoRotate();
      const reduced = this.quality.reducedMotion();
      this.controller?.setAutoRotate(rotate);
      this.controller?.setReducedMotion(reduced);
    });
  }

  onNudge(delta: number): void {
    this.controller?.nudgeOrbit(delta);
  }

  onToggleAutoRotate(): void {
    this.autoRotate.update((prev) => !prev);
  }

  onResetCamera(): void {
    this.controller?.resetCamera();
  }

  onSelectAnimation(index: number): void {
    this.mediaState.update((prev) => ({ ...prev, activeAnimationIndex: index }));
    this.controller?.selectAnimation(index);
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.disposeController();
  }

  private async mountScene(canvas: HTMLCanvasElement): Promise<void> {
    this.mounting = true;
    try {
      const mount = await this.loadSceneMounter();
      if (this.disposed || !this.canUseWebGl()) return;
      this.controller = mount({
        canvas,
        tier: this.quality.tier(),
        reducedMotion: this.quality.reducedMotion(),
        autoRotate: this.autoRotate(),
        bodyModel: this.bodyModel(),
        originKey: this.originKey(),
        onMediaStateChange: (next) => {
          if (!this.disposed) this.mediaState.set(next);
        },
        onContextLost: () => {
          this.disposeController();
          this.webglLost.set(true);
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
