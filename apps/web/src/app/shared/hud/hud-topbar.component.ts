import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/stores/auth.store';
import { QualityStore } from '../../core/stores/quality.store';
import { SystemStatusStore } from '../../core/stores/system-status.store';

@Component({
  selector: 'pv-hud-topbar',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="hud-topbar">
      <a
        [routerLink]="[]"
        fragment="main-heading"
        class="skip-link visually-hidden"
        (click)="jumpToMainContent($event)"
      >
        Pular para o conteúdo principal
      </a>

      <div class="hud-topbar__left">
        <a routerLink="/" class="hud-brand">
          <span class="hud-brand__dot" aria-hidden="true"></span>
          <span class="hud-brand__name">PokéVerse OS</span>
        </a>

        <button type="button" class="hud-pill hud-pill--visitor" (click)="openVisitorInfo()">
          Modo Visitante
        </button>
      </div>

      <div class="hud-topbar__right">
        <button
          type="button"
          class="hud-pill hud-pill--status"
          [class.is-ok]="statusBadge().tone === 'ok'"
          [class.is-error]="statusBadge().tone === 'warn'"
          (click)="systemStatus.refresh()"
          title="Recarregar verificação /health/ready da API NestJS"
        >
          {{ statusBadge().label }}
        </button>

        <button
          type="button"
          class="hud-pill hud-pill--perf"
          (click)="quality.cyclePreference()"
          aria-label="Alternar perfil de desempenho gráfico"
        >
          {{ quality.badgeLabel() }}
        </button>
      </div>
    </header>
  `,
  styles: [
    `
      .hud-topbar {
        position: relative;
        z-index: var(--pv-z-hud);
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--pv-space-2);
        padding: var(--pv-space-2) var(--pv-space-4);
        background: var(--pv-surface);
        border-block-end: 1px solid var(--pv-border-subtle);
      }

      .hud-topbar__left,
      .hud-topbar__right {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--pv-space-2);
        min-inline-size: 0;
      }

      .hud-brand {
        display: inline-flex;
        align-items: center;
        gap: var(--pv-space-2);
        min-block-size: 2.75rem;
        padding-inline: var(--pv-space-2);
        font-weight: 800;
        letter-spacing: -0.02em;
        text-decoration: none;
        border-radius: var(--pv-radius-sm);
      }

      .hud-brand__dot {
        inline-size: 0.875rem;
        block-size: 0.875rem;
        border-radius: 50%;
        background: var(--pv-sapphire);
        border: 2px solid var(--pv-ink-primary);
      }

      .hud-pill {
        min-block-size: 2.75rem;
        padding: 0.375rem 0.875rem;
        border-radius: var(--pv-radius-pill);
        border: 1px solid var(--pv-border-subtle);
        background: var(--pv-surface-elevated);
        font-size: 0.8125rem;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }

      .hud-pill:hover {
        border-color: var(--pv-border-strong);
      }

      .hud-pill--status.is-ok {
        border-color: var(--pv-emerald);
        color: var(--pv-emerald);
      }

      .hud-pill--status.is-error {
        border-color: var(--pv-amber);
        color: var(--pv-amber);
      }

      .skip-link:focus {
        position: fixed;
        inset-block-start: var(--pv-space-2);
        inset-inline-start: var(--pv-space-2);
        z-index: var(--pv-z-modal);
        padding: var(--pv-space-2) var(--pv-space-4);
        background: var(--pv-dex-red);
        color: var(--pv-ink-on-accent);
        border-radius: var(--pv-radius-sm);
        text-decoration: none;
      }
    `,
  ],
})
export class HudTopbarComponent {
  readonly quality = inject(QualityStore);
  readonly systemStatus = inject(SystemStatusStore);
  private readonly auth = inject(AuthStore);

  readonly statusBadge = computed(() => {
    const state = this.systemStatus.state();
    switch (state.status) {
      case 'loading':
        return { tone: 'neutral', label: 'API: Verificando...' };
      case 'success':
        return state.data.readiness.status === 'ok'
          ? { tone: 'ok', label: 'API: Online (4/4)' }
          : { tone: 'warn', label: 'API: Degradada' };
      case 'error':
        return { tone: 'warn', label: 'API: Offline (Reconectar)' };
      default:
        return { tone: 'neutral', label: 'API: Verificar' };
    }
  });

  jumpToMainContent(event: Event): void {
    event.preventDefault();
    const target =
      document.getElementById('main-heading') ?? document.getElementById('main-content');
    target?.focus();
  }

  openVisitorInfo(): void {
    this.auth.requestTrainerAccess(
      'Sessão em Modo Visitante',
      'Você está navegando sem conta autenticada. Os módulos públicos (Pokédex 3D e Museu) funcionam imediatamente; o login de treinador com gravação em PostgreSQL entra na Fase 2.',
    );
  }
}
