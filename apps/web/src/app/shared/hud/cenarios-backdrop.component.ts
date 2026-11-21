import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { QualityStore } from '../../core/stores/quality.store';
import { type ScenarioDefinition, ScenarioStore } from '../../core/stores/scenario.store';

const MOBILE_MAX_PX = 879;

@Component({
  selector: 'pv-cenarios-backdrop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cenarios-fundo" aria-hidden="true">
      @for (item of scenarioStore.scenarios; track item.id) {
        <img
          [attr.src]="resolveSrc(item)"
          [attr.fetchpriority]="item.id === scenarioStore.activeScenario() ? 'high' : 'low'"
          alt=""
          class="cenario-imagem"
          [class.is-active]="item.id === scenarioStore.activeScenario()"
          decoding="async"
        />
      }
      <div class="cenario-vinheta"></div>
    </div>
  `,
})
export class CenariosBackdropComponent implements OnDestroy {
  readonly scenarioStore = inject(ScenarioStore);
  private readonly quality = inject(QualityStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly viewportWidth = signal(
    this.isBrowser ? window.innerWidth : 1280,
  );

  private readonly useMobileVariant = computed(
    () => this.viewportWidth() <= MOBILE_MAX_PX || this.quality.tier() === 'lite',
  );

  private readonly onResize = () => {
    this.viewportWidth.set(window.innerWidth);
  };

  constructor() {
    if (this.isBrowser) {
      window.addEventListener('resize', this.onResize, { passive: true });
    }
  }

  resolveSrc(item: ScenarioDefinition): string | null {
    const isActive = item.id === this.scenarioStore.activeScenario();
    const shouldAttach =
      isActive || this.quality.tier() === 'ultra' || this.scenarioStore.keepInactiveAttached();
    if (!shouldAttach) {
      return null;
    }
    return this.useMobileVariant() ? item.mobileSrc : item.desktopSrc;
  }

  ngOnDestroy(): void {
    if (this.isBrowser) {
      window.removeEventListener('resize', this.onResize);
    }
  }
}
