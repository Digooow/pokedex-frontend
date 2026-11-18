import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { PLATFORM_MODULES } from '@pokeverse/shared';
import { AuthStore } from '../../core/stores/auth.store';
import { RequiresTrainerDirective } from '../directives/requires-trainer.directive';

@Component({
  selector: 'pv-hud-quick-dock',
  imports: [RouterLink, RouterLinkActive, RequiresTrainerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="hud-dock" aria-label="Viagem Rápida">
      <ul class="hud-dock__list">
        @for (mod of modules; track mod.id) {
          <li class="hud-dock__item">
            @if (mod.requiresTrainer && !auth.isAuthenticated()) {
              <button
                type="button"
                [pvRequiresTrainer]="mod.label"
                [lockedDescription]="mod.summary"
                class="hud-dock__link hud-dock__link--locked"
              >
                <span class="hud-dock__key tabular-nums" aria-hidden="true">{{ mod.shortcut }}</span>
                <span class="hud-dock__label">{{ mod.label }}</span>
                <span class="hud-dock__lock" aria-hidden="true">🔒</span>
              </button>
            } @else {
              <a
                [routerLink]="mod.route"
                routerLinkActive="is-active"
                class="hud-dock__link"
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
        z-index: var(--pv-z-hud);
        padding: var(--pv-space-2) var(--pv-space-3);
        padding-block-end: max(var(--pv-space-2), env(safe-area-inset-bottom));
        background: var(--pv-surface);
        border-block-start: 1px solid var(--pv-border-subtle);
      }

      .hud-dock__list {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: var(--pv-space-1) var(--pv-space-2);
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .hud-dock__item {
        flex: 0 1 auto;
        min-inline-size: 0;
      }

      .hud-dock__link {
        display: inline-flex;
        align-items: center;
        gap: var(--pv-space-1);
        min-block-size: 2.75rem;
        padding: 0.375rem 0.75rem;
        border-radius: var(--pv-radius-pill);
        border: 1px solid var(--pv-border-subtle);
        background: var(--pv-surface-elevated);
        font-size: 0.8125rem;
        font-weight: 600;
        text-decoration: none;
        white-space: nowrap;
        cursor: pointer;
      }

      @media (min-width: 48rem) {
        .hud-dock__link {
          gap: var(--pv-space-2);
          padding: 0.375rem 0.875rem;
          font-size: 0.875rem;
        }
      }

      .hud-dock__link:hover {
        border-color: var(--pv-border-strong);
      }

      .hud-dock__link.is-active {
        border-color: var(--pv-border-gold);
        background: var(--pv-dex-red);
        color: var(--pv-ink-on-accent);
      }

      .hud-dock__link--locked {
        opacity: 0.82;
      }

      .hud-dock__key {
        display: inline-grid;
        place-items: center;
        inline-size: 1.375rem;
        block-size: 1.375rem;
        border-radius: 50%;
        background: oklch(14% 0.02 255 / 0.7);
        font-size: 0.75rem;
      }
    `,
  ],
})
export class HudQuickDockComponent {
  readonly modules = PLATFORM_MODULES;
  readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

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
    void this.router.navigateByUrl(matched.route);
  }
}
