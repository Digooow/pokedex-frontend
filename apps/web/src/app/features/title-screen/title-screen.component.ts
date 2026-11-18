import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/stores/auth.store';
import { QualityStore } from '../../core/stores/quality.store';
import { SystemStatusStore } from '../../core/stores/system-status.store';

interface InfraDependencyCard {
  readonly name: string;
  readonly status: 'up' | 'down';
  readonly latencyMs: number;
}

@Component({
  selector: 'pv-title-screen',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="title-stage" aria-labelledby="main-heading">
      <img
        class="title-stage__bg"
        src="assets/backgrounds/mirante-hoenn-desktop.webp"
        srcset="
          assets/backgrounds/mirante-hoenn-mobile.webp   820w,
          assets/backgrounds/mirante-hoenn-desktop.webp 1920w
        "
        sizes="100vw"
        alt=""
        aria-hidden="true"
        decoding="async"
        fetchpriority="high"
      />

      <div class="title-hero">
        <span class="title-hero__badge">FASE 2 • AUTH JWT + POSTGRESQL + REDIS + KAFKA</span>
        <h1 id="main-heading" tabindex="-1" class="title-hero__title">PokéVerse OS</h1>
        <p class="title-hero__subtitle">
          Sistema operacional tático integrando a Pokédex 3D skeuomórfica, detecção automática de
          hardware e arquitetura orientada a eventos em tempo real.
        </p>

        <div class="title-hero__actions">
          <a routerLink="/pokedex" class="cta cta--primary">
            {{ auth.isAuthenticated() ? 'Abrir Pokédex Sincronizada' : 'Abrir Pokédex 3D (Visitante)' }}
          </a>
          <a routerLink="/museu" class="cta cta--secondary">Museu das Regiões</a>
          @if (!auth.isAuthenticated()) {
            <button type="button" class="cta cta--outline" (click)="requestTrainerLogin()">
              Entrar / Criar Conta
            </button>
          }
        </div>

        <section class="infra-panel" aria-label="Telemetria local da infraestrutura">
          <div class="infra-panel__head">
            <div>
              <strong>Hardware Detectado:</strong>
              <span>{{ quality.badgeLabel() }}</span>
            </div>
            <button type="button" class="infra-panel__retry" (click)="systemStatus.refresh()">
              Atualizar Infra
            </button>
          </div>

          @if (systemStatus.state().status === 'loading') {
            <p class="infra-panel__msg">Consultando PostgreSQL, Redis, Kafka e S3...</p>
          } @else if (dependencyCards(); as deps) {
            <ul class="infra-grid">
              @for (dep of deps; track dep.name) {
                <li class="infra-chip" [class.is-up]="dep.status === 'up'">
                  <span>{{ dep.name }}</span>
                  <span class="tabular-nums">{{ dep.status.toUpperCase() }} • {{ dep.latencyMs }}ms</span>
                </li>
              }
            </ul>
          } @else {
            <p class="infra-panel__msg">
              Back-end NestJS desconectado no momento — modos públicos seguem liberados.
            </p>
          }
        </section>
      </div>
    </section>
  `,
  styles: [
    `
      .title-stage {
        position: relative;
        display: grid;
        place-items: center;
        min-block-size: calc(100dvh - 8.5rem);
        padding: var(--pv-space-5) var(--pv-space-3);
      }

      .title-stage__bg {
        position: fixed;
        inset: 0;
        z-index: var(--pv-z-backdrop);
        inline-size: 100%;
        block-size: 100%;
        object-fit: cover;
        opacity: 0.35;
        pointer-events: none;
      }

      .title-hero {
        position: relative;
        z-index: var(--pv-z-stage);
        display: grid;
        gap: var(--pv-space-4);
        inline-size: min(48rem, 100%);
        padding: var(--pv-space-5);
        border-radius: var(--pv-radius-lg);
        border: 1px solid var(--pv-border-subtle);
        background: var(--pv-surface);
        box-shadow: 0 24px 64px oklch(0% 0 0 / 0.55);
      }

      .title-hero__badge {
        justify-self: start;
        padding: 0.25rem 0.75rem;
        border-radius: var(--pv-radius-pill);
        border: 1px solid var(--pv-border-gold);
        color: var(--pv-border-gold);
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.04em;
      }

      .title-hero__title {
        margin: 0;
        font-size: clamp(2rem, 5vw, 3.25rem);
        line-height: 1.08;
        letter-spacing: -0.03em;
      }

      .title-hero__subtitle {
        margin: 0;
        color: var(--pv-ink-muted);
        max-inline-size: 56ch;
      }

      .title-hero__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--pv-space-2);
      }

      .cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: 2.875rem;
        padding: 0.625rem 1.25rem;
        border-radius: var(--pv-radius-sm);
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
        border: 1px solid transparent;
      }

      .cta--primary {
        background: var(--pv-dex-red);
        color: var(--pv-ink-on-accent);
      }

      .cta--primary:hover {
        background: var(--pv-dex-red-deep);
      }

      .cta--secondary {
        background: var(--pv-surface-elevated);
        border-color: var(--pv-border-strong);
      }

      .cta--outline {
        background: transparent;
        border-color: var(--pv-border-subtle);
      }

      .infra-panel {
        display: grid;
        gap: var(--pv-space-3);
        padding: var(--pv-space-3);
        border-radius: var(--pv-radius-md);
        background: oklch(15% 0.02 255 / 0.85);
        border: 1px solid var(--pv-border-subtle);
      }

      .infra-panel__head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--pv-space-2);
        font-size: 0.875rem;
      }

      .infra-panel__head strong {
        margin-inline-end: var(--pv-space-1);
      }

      .infra-panel__retry {
        min-block-size: 2.75rem;
        padding: 0.375rem 0.875rem;
        border-radius: var(--pv-radius-sm);
        border: 1px solid var(--pv-border-subtle);
        background: var(--pv-surface-elevated);
        font-size: 0.8125rem;
        font-weight: 600;
        cursor: pointer;
      }

      .infra-panel__msg {
        margin: 0;
        font-size: 0.875rem;
        color: var(--pv-ink-muted);
      }

      .infra-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
        gap: var(--pv-space-2);
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .infra-chip {
        display: flex;
        justify-content: space-between;
        gap: var(--pv-space-2);
        padding: var(--pv-space-2) var(--pv-space-3);
        border-radius: var(--pv-radius-sm);
        border: 1px solid var(--pv-danger);
        font-size: 0.8125rem;
        font-weight: 600;
      }

      .infra-chip.is-up {
        border-color: var(--pv-emerald);
        color: var(--pv-emerald);
      }
    `,
  ],
})
export class TitleScreenComponent {
  readonly quality = inject(QualityStore);
  readonly systemStatus = inject(SystemStatusStore);
  readonly auth = inject(AuthStore);

  readonly dependencyCards = computed<readonly InfraDependencyCard[] | null>(() => {
    const state = this.systemStatus.state();
    if (state.status !== 'success') {
      return null;
    }
    const deps = state.data.readiness.dependencies;
    return [
      { name: 'PostgreSQL', status: deps.postgres.status, latencyMs: deps.postgres.latencyMs },
      { name: 'Redis', status: deps.redis.status, latencyMs: deps.redis.latencyMs },
      { name: 'Redpanda/Kafka', status: deps.kafka.status, latencyMs: deps.kafka.latencyMs },
      { name: 'MinIO/S3', status: deps.s3.status, latencyMs: deps.s3.latencyMs },
    ];
  });

  requestTrainerLogin(): void {
    this.auth.requestTrainerAccess(
      'Entrar ou Criar Conta de Treinador',
      'Autentique-se via Argon2id + JWT para gravar seus 10 slots da Pokédex no PostgreSQL e acompanhar eventos ao vivo via Kafka + WebSocket.',
    );
  }
}
