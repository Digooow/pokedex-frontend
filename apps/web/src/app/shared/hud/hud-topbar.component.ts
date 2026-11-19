import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/stores/auth.store';
import { SecurityIamStore } from '../../core/stores/security-iam.store';
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

      <div class="hud-topbar__inner">
        <div class="hud-topbar__left">
          <a routerLink="/" class="hud-brand">
            <span class="hud-brand__lens" aria-hidden="true"></span>
            <span class="hud-brand__name">PokéVerse OS</span>
          </a>

          @if (auth.trainer(); as trainer) {
            <span class="hud-pill hud-pill--trainer tabular-nums">
              {{ trainer.username }} • ELO {{ trainer.eloRating }}
            </span>
            @if (auth.isMfaPending()) {
              <button
                type="button"
                class="hud-pill hud-pill--warn"
                (click)="auth.openMfaChallengePrompt()"
              >
                Concluir 2FA
              </button>
            } @else {
              @if (!trainer.emailVerifiedAt) {
                <button
                  type="button"
                  class="hud-pill hud-pill--warn"
                  (click)="openVerifyEmail(trainer.email)"
                >
                  Verificar E-mail (OTP)
                </button>
              }
              <button
                type="button"
                class="hud-pill"
                [attr.aria-pressed]="securityIam.dialogOpen()"
                (click)="securityIam.openDialog()"
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
            class="hud-pill"
            [class.is-ok]="statusBadge().tone === 'ok'"
            [class.is-error]="statusBadge().tone === 'warn'"
            (click)="systemStatus.refresh()"
            [title]="statusBadge().title"
          >
            {{ statusBadge().label }}
          </button>
        </div>
      </div>
    </header>
  `,
  styles: [
    `
      .hud-topbar {
        position: sticky;
        inset-block-start: 0;
        z-index: 30;
        background-color: rgba(9, 17, 30, 0.86);
        border-block-end: 1px solid var(--borda-barra-externa, var(--pv-border-subtle));
      }

      @supports (backdrop-filter: blur(8px)) {
        .hud-topbar {
          background-color: rgba(9, 17, 30, 0.72);
          backdrop-filter: blur(8px);
        }
      }

      :host-context(html[data-perf-tier='lite']) .hud-topbar {
        backdrop-filter: none;
        background-color: rgba(9, 17, 30, 0.94);
      }

      .hud-topbar__inner {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--pv-space-2);
        inline-size: min(76rem, 100%);
        margin-inline: auto;
        padding: 0.42rem var(--pv-space-3);
      }

      .hud-topbar__left,
      .hud-topbar__right {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.375rem;
      }

      .hud-brand {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        min-block-size: 2.125rem;
        padding: 0.25rem 0.65rem;
        border-radius: var(--raio-medio, 0.625rem);
        text-decoration: none;
        color: var(--texto-lcd-principal, var(--pv-ink-primary));
        font-weight: 800;
        font-size: 0.9rem;
        letter-spacing: -0.015em;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(148, 163, 184, 0.24);
        transition: border-color 150ms ease, background-color 150ms ease, transform 90ms ease;
      }

      .hud-brand:hover {
        border-color: var(--palette-cyan-300, var(--pv-cyan));
        background: rgba(30, 41, 59, 0.78);
      }

      .hud-brand:active {
        transform: translateY(1px);
      }

      .hud-brand__lens {
        inline-size: 0.85rem;
        block-size: 0.85rem;
        border-radius: 50%;
        border: 2px solid oklch(96% 0.01 250);
        background: radial-gradient(
          circle at 30% 28%,
          oklch(88% 0.1 215),
          oklch(55% 0.18 242) 60%,
          oklch(28% 0.11 248)
        );
        box-shadow: 0 0 8px rgba(56, 189, 248, 0.45);
      }

      .hud-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        min-block-size: 2rem;
        padding: 0.22rem 0.65rem;
        border-radius: 0.45rem;
        border: 1px solid var(--borda-barra-externa, rgba(148, 163, 184, 0.34));
        background-color: var(--bg-botao-cenario, rgba(15, 23, 42, 0.75));
        color: var(--texto-lcd-secundario, var(--pv-ink-primary));
        font-size: 0.75rem;
        font-weight: 700;
        cursor: pointer;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.08),
          0 1px 2px rgba(2, 6, 23, 0.35);
        transition:
          background-color 150ms ease,
          border-color 150ms ease,
          color 150ms ease,
          transform 80ms ease;
      }

      button.hud-pill:hover {
        background-color: var(--bg-botao-cenario-hover, rgba(30, 41, 59, 0.92));
        border-color: var(--palette-cyan-300, var(--pv-cyan));
        color: var(--texto-lcd-principal, #fff);
      }

      button.hud-pill:active {
        transform: translateY(1px);
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.55);
      }

      .hud-ticker {
        display: inline-flex;
        align-items: center;
        gap: var(--pv-space-2);
        min-inline-size: 0;
        max-inline-size: 22rem;
        margin: 0;
        padding: 0.2rem 0.65rem;
        border-radius: var(--pv-radius-pill);
        border: 1px solid rgba(52, 211, 153, 0.42);
        background: oklch(24% 0.05 155 / 0.42);
        font-size: 0.72rem;
        font-weight: 600;
        color: var(--pv-ink-primary);
      }

      .hud-ticker__dot {
        flex: 0 0 auto;
        inline-size: 0.45rem;
        block-size: 0.45rem;
        border-radius: 50%;
        background: var(--pv-emerald);
      }

      .hud-ticker__text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .hud-pill--visitor {
        border-color: rgba(250, 204, 21, 0.48);
        color: var(--palette-amber-200, #fde68a);
      }

      .hud-pill--trainer {
        border-color: rgba(52, 211, 153, 0.52);
        background: rgba(6, 78, 59, 0.52);
        color: #ecfdf5;
        cursor: default;
      }

      .hud-pill--warn {
        border-color: var(--pv-amber);
        background: oklch(34% 0.09 80 / 0.72);
        color: var(--palette-amber-100, #fef3c7);
      }

      .hud-pill.is-ok {
        border-color: rgba(52, 211, 153, 0.45);
        color: #a7f3d0;
      }

      .hud-pill.is-error {
        border-color: var(--pv-danger);
        color: #fecaca;
      }

      .skip-link:focus {
        position: fixed;
        inset-block-start: 0.5rem;
        inset-inline-start: 0.5rem;
        z-index: 100;
        padding: 0.65rem 1rem;
        border-radius: var(--pv-radius-sm);
        background: var(--pv-dex-red);
        color: var(--pv-ink-primary);
        font-weight: 700;
        text-decoration: none;
      }
    `,
  ],
})
export class HudTopbarComponent {
  readonly auth = inject(AuthStore);
  readonly securityIam = inject(SecurityIamStore);
  readonly systemStatus = inject(SystemStatusStore);
  readonly ticker = inject(WorldTickerStore);

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

  openVisitorInfo(): void {
    this.auth.requestTrainerAccess(
      'Modo Visitante Ativo',
      'Explore Pokédex e Museu livremente. Entre ou cadastre sua conta de Treinador para sincronizar os 10 slots e salvar progresso na nuvem.',
    );
  }

  openVerifyEmail(email: string): void {
    this.auth.requestTrainerAccess(
      'Confirmar E-mail do Treinador',
      `Enviamos um código OTP de 6 dígitos para ${email}.`,
      undefined,
      'verify-email',
    );
  }

  jumpToMainContent(event: Event): void {
    event.preventDefault();
    const target = document.getElementById('main-heading');
    target?.focus();
  }
}
