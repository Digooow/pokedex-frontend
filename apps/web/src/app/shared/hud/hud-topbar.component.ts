import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SystemStatusStore } from '../../core/stores/system-status.store';
import { WorldTickerStore } from '../../core/stores/world-ticker.store';
import { MainLandmarkFocusService } from '../directives/main-heading.directive';
import { HudModulesMenuComponent } from './hud-modules-menu.component';
import { HudSettingsMenuComponent } from './hud-settings-menu.component';
import { HudUserMenuComponent } from './hud-user-menu.component';

export type HudTopbarMenuId = 'modules' | 'user' | 'settings';

@Component({
  selector: 'pv-hud-topbar',
  imports: [RouterLink, HudModulesMenuComponent, HudUserMenuComponent, HudSettingsMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hud-topbar.component.html',
  styleUrl: './hud-topbar.component.scss',
})
export class HudTopbarComponent {
  readonly systemStatus = inject(SystemStatusStore);
  readonly ticker = inject(WorldTickerStore);
  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private readonly mainLandmark = inject(MainLandmarkFocusService);

  readonly activeMenu = signal<HudTopbarMenuId | null>(null);

  readonly statusBadge = computed(() => {
    const state = this.systemStatus.state();
    switch (state.status) {
      case 'loading':
        return { label: 'Nuvem: Checando...', tone: 'neutral', title: 'Consultando /health/ready' };
      case 'success': {
        const ready = state.data.readiness;
        const ok = ready.status === 'ok';
        return {
          label: ok ? 'Nuvem Online' : 'Nuvem Degradada',
          tone: ok ? 'ok' : 'warn',
          title: `DB: ${ready.dependencies.postgres.status} (${ready.dependencies.postgres.latencyMs}ms) · Redis: ${ready.dependencies.redis.status} · Kafka: ${ready.dependencies.kafka.status}`,
        };
      }
      case 'error':
        return { label: 'Modo Offline', tone: 'warn', title: state.error.message };
      default:
        return { label: 'Nuvem...', tone: 'neutral', title: 'Status inicial' };
    }
  });

  toggleMenu(menu: HudTopbarMenuId): void {
    this.activeMenu.update((current) => (current === menu ? null : menu));
  }

  closeMenus(): void {
    this.activeMenu.set(null);
  }

  jumpToMainContent(event: Event): void {
    event.preventDefault();
    this.closeMenus();
    this.mainLandmark.focusMainHeading();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.activeMenu() === null) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && !this.hostRef.nativeElement.contains(target)) {
      this.closeMenus();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.activeMenu() !== null) {
      this.closeMenus();
    }
  }
}
