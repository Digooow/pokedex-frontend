import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import type { AsyncState, SearchablePokemonItem } from '@pokeverse/shared';
import type { PokemonDetailView } from '../services/pokedex.store';

@Component({
  selector: 'pv-pokedex-visor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="visor-panel" aria-labelledby="visor-title">
      <header class="visor-panel__header">
        <h2 id="visor-title" class="visor-panel__heading">Visor de Resultados</h2>
        <span class="visor-badge">{{ badgeText() }}</span>
      </header>

      <div class="visor-screen" [attr.aria-busy]="detailState().status === 'loading'">
        @switch (detailState().status) {
          @case ('loading') {
            <div class="visor-skeleton" aria-label="Carregando dados do Pokémon">
              <div class="visor-skeleton__hero"></div>
              <div class="visor-skeleton__line"></div>
              <div class="visor-skeleton__line visor-skeleton__line--short"></div>
              <div class="visor-skeleton__bars"></div>
            </div>
          }
          @case ('error') {
            <div class="visor-state" role="alert">
              <p class="visor-state__title">Falha na consulta</p>
              <p class="visor-state__desc">{{ errorMessage() }}</p>
              <button type="button" class="visor-btn-retry" (click)="retry.emit()">
                Tentar novamente
              </button>
              @if (suggestions().length > 0) {
                <div class="visor-suggestions">
                  <span>Você quis dizer:</span>
                  <div class="visor-suggestions__list">
                    @for (item of suggestions(); track item.id) {
                      <button
                        type="button"
                        class="visor-suggestion-chip"
                        (click)="selectSuggestion.emit(item.name)"
                      >
                        #{{ item.id }} {{ item.displayName }}
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          }
          @case ('success') {
            @if (pokemonData(); as mon) {
              <article class="pokemon-sheet">
                <div class="pokemon-sheet__top">
                  <div class="pokemon-sheet__artwork">
                    @if (mon.spriteUrl) {
                      <img
                        [src]="mon.spriteUrl"
                        [alt]="mon.displayName"
                        width="136"
                        height="136"
                        loading="eager"
                        decoding="async"
                      />
                    } @else {
                      <span class="pokemon-sheet__no-art">Sem imagem</span>
                    }
                  </div>

                  <div class="pokemon-sheet__meta">
                    <span class="pokemon-sheet__id tabular-nums">{{ mon.paddedId }}</span>
                    <h3 class="pokemon-sheet__name">{{ mon.displayName }}</h3>
                    <div class="pokemon-sheet__types">
                      @for (typeName of mon.types; track typeName) {
                        <span class="type-chip">{{ typeName }}</span>
                      }
                    </div>
                    <dl class="pokemon-sheet__metrics tabular-nums">
                      <div>
                        <dt>Altura</dt>
                        <dd>{{ mon.heightMeters }}</dd>
                      </div>
                      <div>
                        <dt>Peso</dt>
                        <dd>{{ mon.weightKg }}</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div class="pokemon-sheet__stats">
                  @for (stat of mon.stats; track stat.label) {
                    <div class="stat-row">
                      <span class="stat-row__label">{{ stat.label }}</span>
                      <div class="stat-row__track" aria-hidden="true">
                        <div
                          class="stat-row__fill"
                          [style.width.%]="statWidthPct(stat.value)"
                        ></div>
                      </div>
                      <span class="stat-row__value tabular-nums">{{ stat.value }}</span>
                    </div>
                  }
                </div>

                <p class="pokemon-sheet__abilities">
                  <strong>Habilidades:</strong> {{ mon.abilities.join(', ') || 'Não informadas' }}
                </p>
              </article>
            }
          }
          @default {
            <div class="visor-state">
              <p class="visor-state__title">Nenhum Pokémon no visor</p>
              <p class="visor-state__desc">
                Pesquise por nome, número ou grafia aproximada (ex.: <code>pikaxu</code>) ou escolha
                um Pokémon na lista ao lado.
              </p>
            </div>
          }
        }
      </div>
    </section>
  `,
  styles: [
    `
      .visor-panel {
        display: flex;
        flex-direction: column;
        gap: var(--pv-space-3);
        min-inline-size: 0;
        flex: 1 1 auto;
      }

      .visor-panel__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--pv-space-2);
      }

      .visor-panel__heading {
        margin: 0;
        font-size: 1rem;
      }

      .visor-badge {
        padding: 0.25rem 0.625rem;
        border-radius: var(--pv-radius-pill);
        border: 1px solid var(--pv-border-subtle);
        font-size: 0.75rem;
        color: var(--pv-ink-muted);
      }

      .visor-screen {
        min-block-size: 21rem;
        padding: var(--pv-space-4);
        border-radius: var(--pv-radius-md);
        background: var(--pv-visor-lcd);
        border: 2px solid var(--pv-border-subtle);
        color: var(--pv-ink-primary);
      }

      .visor-state {
        display: grid;
        place-items: center;
        text-align: center;
        gap: var(--pv-space-2);
        min-block-size: 18rem;
        align-content: center;
      }

      .visor-state__title {
        margin: 0;
        font-weight: 700;
        font-size: 1.0625rem;
      }

      .visor-state__desc {
        margin: 0;
        color: var(--pv-ink-muted);
        max-inline-size: 36ch;
      }

      .visor-btn-retry {
        min-block-size: 2.75rem;
        padding: 0.5rem 1rem;
        border-radius: var(--pv-radius-sm);
        border: 0;
        background: var(--pv-dex-red);
        color: var(--pv-ink-on-accent);
        font-weight: 700;
        cursor: pointer;
      }

      .visor-suggestions__list {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: var(--pv-space-2);
        margin-block-start: var(--pv-space-2);
      }

      .visor-suggestion-chip {
        min-block-size: 2.75rem;
        padding: 0.375rem 0.75rem;
        border-radius: var(--pv-radius-pill);
        border: 1px solid var(--pv-sapphire);
        background: transparent;
        cursor: pointer;
      }

      .visor-skeleton {
        display: grid;
        gap: var(--pv-space-3);
      }

      .visor-skeleton__hero,
      .visor-skeleton__line,
      .visor-skeleton__bars {
        border-radius: var(--pv-radius-sm);
        background: oklch(30% 0.025 250 / 0.55);
      }

      .visor-skeleton__hero {
        block-size: 8.5rem;
      }

      .visor-skeleton__line {
        block-size: 1.25rem;
      }

      .visor-skeleton__line--short {
        inline-size: 55%;
      }

      .visor-skeleton__bars {
        block-size: 6rem;
      }

      .pokemon-sheet {
        display: grid;
        gap: var(--pv-space-3);
      }

      .pokemon-sheet__top {
        display: flex;
        flex-wrap: wrap;
        gap: var(--pv-space-4);
        align-items: center;
      }

      .pokemon-sheet__artwork {
        inline-size: 8.5rem;
        block-size: 8.5rem;
        display: grid;
        place-items: center;
        border-radius: var(--pv-radius-md);
        background: oklch(24% 0.03 250);
        flex-shrink: 0;
      }

      .pokemon-sheet__meta {
        display: grid;
        gap: var(--pv-space-2);
        min-inline-size: 0;
        flex: 1 1 12rem;
      }

      .pokemon-sheet__id {
        font-family: var(--pv-font-mono);
        color: var(--pv-border-gold);
        font-weight: 700;
      }

      .pokemon-sheet__name {
        margin: 0;
        font-size: 1.375rem;
        overflow-wrap: anywhere;
      }

      .pokemon-sheet__types {
        display: flex;
        flex-wrap: wrap;
        gap: var(--pv-space-2);
      }

      .type-chip {
        padding: 0.25rem 0.625rem;
        border-radius: var(--pv-radius-pill);
        background: oklch(32% 0.05 245);
        font-size: 0.75rem;
        font-weight: 700;
      }

      .pokemon-sheet__metrics {
        display: flex;
        gap: var(--pv-space-4);
        margin: 0;
      }

      .pokemon-sheet__metrics div {
        display: grid;
      }

      .pokemon-sheet__metrics dt {
        font-size: 0.75rem;
        color: var(--pv-ink-muted);
      }

      .pokemon-sheet__metrics dd {
        margin: 0;
        font-weight: 700;
      }

      .pokemon-sheet__stats {
        display: grid;
        gap: var(--pv-space-2);
      }

      .stat-row {
        display: grid;
        grid-template-columns: 7.5rem 1fr 2.5rem;
        align-items: center;
        gap: var(--pv-space-2);
        font-size: 0.8125rem;
      }

      .stat-row__track {
        block-size: 0.5rem;
        border-radius: var(--pv-radius-pill);
        background: oklch(26% 0.02 250);
        overflow: hidden;
      }

      .stat-row__fill {
        block-size: 100%;
        background: var(--pv-emerald);
      }

      .stat-row__value {
        text-align: end;
        font-weight: 700;
      }

      .pokemon-sheet__abilities {
        margin: 0;
        font-size: 0.875rem;
        color: var(--pv-ink-muted);
      }
    `,
  ],
})
export class PokedexVisorComponent {
  readonly detailState = input.required<AsyncState<PokemonDetailView>>();
  readonly suggestions = input<readonly SearchablePokemonItem[]>([]);

  readonly retry = output<void>();
  readonly selectSuggestion = output<string>();

  badgeText(): string {
    switch (this.detailState().status) {
      case 'loading':
        return 'Consultando...';
      case 'success':
        return 'PokéAPI OK';
      case 'error':
        return 'Falha';
      default:
        return 'Aguardando busca';
    }
  }

  pokemonData(): PokemonDetailView | null {
    const state = this.detailState();
    return state.status === 'success' ? state.data : null;
  }

  errorMessage(): string {
    const state = this.detailState();
    return state.status === 'error' ? state.error.message : '';
  }

  statWidthPct(value: number): number {
    return Math.min(100, Math.round((value / 255) * 100));
  }
}
