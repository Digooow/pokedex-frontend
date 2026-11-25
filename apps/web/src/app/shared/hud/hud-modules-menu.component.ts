import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { PLATFORM_MODULES, type PlatformModuleMeta } from '@pokeverse/shared';
import { filter } from 'rxjs';
import { AuthStore } from '../../core/stores/auth.store';
import { RequiresTrainerDirective } from '../directives/requires-trainer.directive';

@Component({
  selector: 'pv-hud-modules-menu',
  imports: [RouterLink, RequiresTrainerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hud-modules-menu.component.html',
  styleUrl: './hud-modules-menu.component.scss',
})
export class HudModulesMenuComponent {
  readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  readonly open = input<boolean>(false);
  readonly toggled = output<void>();
  readonly closed = output<void>();

  readonly modules = PLATFORM_MODULES;
  readonly currentUrl = signal(this.router.url);

  readonly activeModule = computed<PlatformModuleMeta>(() => {
    const cleanUrl = this.currentUrl().split('?')[0] ?? '/';
    if (cleanUrl === '/enciclopedia') {
      return {
        id: 'museum',
        label: 'Enciclopédia',
        route: '/enciclopedia',
        shortcut: '3',
        requiresTrainer: false,
        summary: '',
      };
    }
    const matched = this.modules.find((mod) =>
      mod.id === 'pokedex' ? cleanUrl === '/' || cleanUrl === '/pokedex' : cleanUrl === mod.route,
    );
    return (
      matched ??
      this.modules[1] ?? {
        id: 'pokedex',
        label: 'Pokédex 3D',
        route: '/pokedex',
        shortcut: '2',
        requiresTrainer: false,
        summary: '',
      }
    );
  });

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

  onLockedModuleSelected(): void {
    this.closed.emit();
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
    this.closed.emit();
    if (matched.requiresTrainer && !this.auth.isAuthenticated()) {
      this.auth.requestTrainerAccess(matched.label, matched.summary, matched.route);
      return;
    }
    void this.router.navigateByUrl(matched.id === 'pokedex' ? '/' : matched.route);
  }
}
