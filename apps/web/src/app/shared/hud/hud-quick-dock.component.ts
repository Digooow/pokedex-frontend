import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PLATFORM_MODULES } from '@pokeverse/shared';
import { AuthStore } from '../../core/stores/auth.store';
import { RequiresTrainerDirective } from '../directives/requires-trainer.directive';

@Component({
  selector: 'pv-hud-quick-dock',
  imports: [RouterLink, RequiresTrainerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="hud-dock" aria-label="Viagem Rápida">
      <ul class="hud-dock__list">
        @for (mod of modules; track mod.id) {
          <li class="hud-dock__item">
            @if (mod.requiresTrainer && !auth.isAuthenticated()) {
              <button
                type="button"
                class="hud-dock__link hud-dock__link--locked"
                [pvRequiresTrainer]="mod.label"
                [lockedDescription]="mod.summary"
              >
                <span class="hud-dock__key tabular-nums" aria-hidden="true">{{ mod.shortcut }}</span>
                <span class="hud-dock__label">{{ mod.label }}</span>
                <span class="hud-dock__lock" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="3" y="7" width="10" height="7" rx="1.5" />
                    <path d="M5 7V5a3 3 0 0 1 6 0v2" />
                  </svg>
                </span>
              </button>
            } @else {
              <a
                [routerLink]="mod.id === 'pokedex' ? '/' : mod.route"
                class="hud-dock__link"
                [class.is-active]="isModuleActive(mod.route, mod.id)"
                [attr.aria-current]="isModuleActive(mod.route, mod.id) ? 'page' : null"
              >
                <span class="hud-dock__key tabular-nums" aria-hidden="true">{{ mod.shortcut }}</span>
                <span class="hud-dock__label">{{ mod.label }}</span>
              </a>
            }
          </li>
        }
      </ul>
    </nav>
  `,
  styles: [
    `
      .hud-dock {
        position: sticky;
        inset-block-end: 0;
        z-index: 30;
        border-block-start: 1px solid var(--borda-barra-externa, var(--pv-border-subtle));
        background-color: rgba(9, 17, 30, 0.88);
        padding: 0.35rem var(--pv-space-3);
      }

      @supports (backdrop-filter: blur(8px)) {
        .hud-dock {
          background-color: rgba(9, 17, 30, 0.74);
          backdrop-filter: blur(8px);
        }
      }

      :host-context(html[data-perf-tier='lite']) .hud-dock {
        backdrop-filter: none;
        background-color: rgba(9, 17, 30, 0.94);
      }

      .hud-dock__list {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 0.4rem;
        inline-size: min(76rem, 100%);
        margin-inline: auto;
        padding: 0;
        list-style: none;
        overflow-x: auto;
        scrollbar-width: none;
      }

      @media (min-width: 720px) {
        .hud-dock__list {
          justify-content: center;
        }
      }

      .hud-dock__item {
        display: flex;
        flex: 0 0 auto;
      }

      .hud-dock__link {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        min-block-size: 2.35rem;
        padding: 0.3rem 0.75rem;
        border-radius: 0.45rem;
        border: 1px solid var(--borda-barra-externa, rgba(148, 163, 184, 0.32));
        background-color: var(--bg-botao-cenario, rgba(15, 23, 42, 0.76));
        color: var(--texto-lcd-secundario, #cbd5e1);
        text-decoration: none;
        font-size: 0.78rem;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.08),
          0 1px 2px rgba(2, 6, 23, 0.4);
        transition:
          background-color 150ms ease,
          border-color 150ms ease,
          color 150ms ease,
          transform 80ms ease;
      }

      .hud-dock__link:hover {
        background-color: var(--bg-botao-cenario-hover, rgba(30, 41, 59, 0.92));
        border-color: var(--palette-cyan-300, var(--pv-cyan));
        color: #ffffff;
      }

      .hud-dock__link:active {
        transform: translateY(1px);
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.55);
      }

      .hud-dock__link.is-active {
        border-color: var(--borda-cenario-ativo, var(--pv-border-gold));
        background: linear-gradient(
          180deg,
          oklch(54% 0.19 25),
          oklch(42% 0.19 25)
        );
        color: #ffffff;
        box-shadow:
          inset 0 1px 0 rgba(255, 235, 235, 0.28),
          0 2px 8px rgba(0, 0, 0, 0.38);
      }

      .hud-dock__link--locked {
        opacity: 0.85;
      }

      .hud-dock__lock {
        display: inline-flex;
        align-items: center;
      }

      .hud-dock__key {
        display: inline-grid;
        place-items: center;
        inline-size: 1.2rem;
        block-size: 1.2rem;
        border-radius: 0.25rem;
        background: oklch(14% 0.02 255 / 0.78);
        border: 1px solid rgba(148, 163, 184, 0.25);
        font-size: 0.68rem;
        font-weight: 800;
      }
    `,
  ],
})
export class HudQuickDockComponent {
  readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  readonly modules = PLATFORM_MODULES;

  isModuleActive(route: string, id: string): boolean {
    const cleanUrl = this.router.url.split('?')[0] ?? '/';
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
