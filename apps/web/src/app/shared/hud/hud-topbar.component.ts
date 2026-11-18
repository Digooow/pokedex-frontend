import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/stores/auth.store';
import { QualityStore } from '../../core/stores/quality.store';
import { SystemStatusStore } from '../../core/stores/system-status.store';
import { WorldTickerStore } from '../../core/stores/world-ticker.store';

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

        @if (auth.trainer(); as trainer) {
          <span class="hud-trainer-badge tabular-nums">
            {{ trainer.username }} • ELO {{ trainer.eloRating }}
          </span>
          @if (auth.isMfaPending()) {
            <button
              type="button"
              class="hud-pill hud-pill--status is-error"
              (click)="auth.openMfaChallengePrompt()"
            >
              Concluir 2FA
            </button>
          } @else {
            @if (!trainer.emailVerifiedAt) {
              <button
                type="button"
                class="hud-pill hud-pill--status is-error"
                (click)="openVerifyEmail(trainer.email)"
              >
                Verificar E-mail (OTP)
              </button>
            }
            <button
              type="button"
              class="hud-pill"
              (click)="auth.openSecuritySettings()"
            >
              {{ trainer.mfaEnabled ? '2FA: Ativo' : 'Segurança / 2FA' }}
            </button>
          }
          <button type="button" class="hud-pill" (click)="auth.logout()">Sair</button>
        } @else {
          <button type="button" class="hud-pill hud-pill--visitor" (click)="openVisitorInfo()">
            Modo Visitante • Entrar
          </button>
        }
      </div>

      @if (ticker.latestEvent(); as liveEvent) {
        <p class="hud-ticker" aria-live="polite">
          <span class="hud-ticker__dot" aria-hidden="true"></span>
          <span class="hud-ticker__text">{{ liveEvent.summary }}</span>
        </p>
      }

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

      .hud-trainer-badge {
        display: inline-flex;
        align-items: center;
        min-block-size: 2.75rem;
        padding: 0.375rem 0.875rem;
        border-radius: var(--pv-radius-pill);
        border: 1px solid var(--pv-emerald);
        background: oklch(24% 0.05 155 / 0.45);
        color: var(--pv-emerald);
        font-size: 0.8125rem;
        font-weight: 700;
      }

      .hud-ticker {
        display: inline-flex;
        align-items: center;
        gap: var(--pv-space-2);
        margin: 0;
        padding: 0.25rem 0.75rem;
        border-radius: var(--pv-radius-pill);
        border: 1px solid var(--pv-border-subtle);
        background: var(--pv-visor-lcd);
        font-size: 0.75rem;
        color: var(--pv-ink-muted);
        max-inline-size: min(26rem, 100%);
        min-inline-size: 0;
      }

      .hud-ticker__dot {
        inline-size: 0.5rem;
        block-size: 0.5rem;
        border-radius: 50%;
        background: var(--pv-emerald);
        flex-shrink: 0;
      }

      .hud-ticker__text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
  readonly auth = inject(AuthStore);
  readonly quality = inject(QualityStore);
  readonly systemStatus = inject(SystemStatusStore);
  readonly ticker = inject(WorldTickerStore);

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
      'Entrar ou Criar Conta de Treinador',
      'Autentique-se via sessão segura (HttpOnly Redis BFF) para sincronizar seus 10 slots na nuvem e desbloquear recursos exclusivos.',
    );
  }

  openVerifyEmail(email: string): void {
    this.auth.requestTrainerAccess(
      'Verificar E-mail com Código OTP',
      `Confirme o código numérico de 6 dígitos enviado para ${email} (inspecione no Mailpit :8025 em desenvolvimento).`,
      undefined,
      'verify-email',
    );
  }
}
