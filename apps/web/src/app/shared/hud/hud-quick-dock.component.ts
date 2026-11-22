import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { PLATFORM_MODULES } from '@pokeverse/shared';
import { filter } from 'rxjs';
import { AuthStore } from '../../core/stores/auth.store';
import { RequiresTrainerDirective } from '../directives/requires-trainer.directive';

@Component({
  selector: 'pv-hud-quick-dock',
  imports: [RouterLink, RequiresTrainerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hud-quick-dock.component.html',
  styleUrl: './hud-quick-dock.component.scss',
})
export class HudQuickDockComponent {
  readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  readonly modules = PLATFORM_MODULES;
  readonly currentUrl = signal(this.router.url);

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
      });
  }

  isModuleActive(route: string, id: string): boolean {
    const cleanUrl = this.currentUrl().split('?')[0] ?? '/';
    if (id === 'pokedex') {
      return cleanUrl === '/' || cleanUrl === '/pokedex';
    }
    return cleanUrl === route;
  }

  @HostListener('window:keydown', ['$event'])
  onShortcutKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.matches('input, textarea, select, [contenteditable]') ||
        target.closest('dialog[open]') !== null)
    ) {
      return;
    }

    const matched = this.modules.find((mod) => mod.shortcut === event.key);
    if (!matched) {
      return;
    }

    event.preventDefault();
    if (matched.requiresTrainer && !this.auth.isAuthenticated()) {
      this.auth.requestTrainerAccess(matched.label, matched.summary, matched.route);
      return;
    }
    void this.router.navigateByUrl(matched.id === 'pokedex' ? '/' : matched.route);
  }
}
