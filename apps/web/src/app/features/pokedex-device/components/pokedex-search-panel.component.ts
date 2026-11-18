import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { PokedexStore } from '../services/pokedex.store';

@Component({
  selector: 'pv-pokedex-search-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="search-panel" aria-labelledby="pv-search-title">
      <div class="search-bezel">
        <h2 id="pv-search-title" class="search-bezel__title">Pesquisar Pokémon</h2>

        <search>
          <form class="search-form" novalidate (submit)="onSubmit($event)">
            <label for="pv-pokemon-input" class="search-form__label">
              Nome ou ID <span aria-hidden="true">*</span>
            </label>

            <div class="search-form__row">
              <input
                id="pv-pokemon-input"
                type="text"
                class="search-form__input"
                [value]="store.query()"
                placeholder="Ex.: pikachu, pikaxu ou 25"
                autocorrect="off"
                autocapitalize="none"
                spellcheck="false"
                enterkeyhint="search"
                [attr.aria-invalid]="showValidationError()"
                aria-describedby="pv-pokemon-hint pv-pokemon-error"
                (input)="onInput($event)"
              />

              <button type="submit" class="search-form__submit">Buscar</button>
            </div>

            <p id="pv-pokemon-hint" class="search-form__hint">
              Filtro em tempo real com tolerância fonética e erros de digitação.
            </p>

            @if (showValidationError()) {
              <p id="pv-pokemon-error" class="search-form__error" role="alert">
                Informe o nome ou número de um Pokémon antes de pesquisar.
              </p>
            }
          </form>
        </search>
      </div>

      <div class="catalog-box">
        <div class="catalog-box__header">
          <span class="catalog-box__status tabular-nums">{{ catalogStatusLabel() }}</span>
          @if (store.catalogState().status === 'error') {
            <button type="button" class="catalog-box__retry" (click)="store.ensureCatalogLoaded()">
              Recarregar
            </button>
          }
        </div>

        <ul class="catalog-list" aria-label="Lista de Pokémon disponíveis">
          @for (item of store.filteredCatalog().items; track item.id) {
            <li class="catalog-list__row">
              <button
                type="button"
                class="catalog-list__btn"
                [class.is-selected]="store.selectedId() === item.id"
                (click)="store.loadPokemonDetail(item.id)"
              >
                <span class="catalog-list__id tabular-nums">#{{ padId(item.id) }}</span>
                <span class="catalog-list__name">{{ item.displayName }}</span>
                @if (item.approximate) {
                  <span class="catalog-list__approx">Aprox.</span>
                }
              </button>
            </li>
          } @empty {
            <li class="catalog-list__empty">
              @if (store.catalogState().status === 'loading') {
                <span>Carregando catálogo da PokéAPI...</span>
              } @else {
                <span>Nenhum Pokémon corresponde ao filtro.</span>
              }
            </li>
          }
        </ul>
      </div>
    </section>
  `,
  styles: [
    `
      .search-panel {
        display: flex;
        flex-direction: column;
        gap: var(--pv-space-3);
        min-inline-size: 0;
      }

      .search-bezel {
        padding: var(--pv-space-3);
        border-radius: var(--pv-radius-md);
        border: 2px solid var(--pv-border-gold);
        background: var(--pv-visor-lcd);
      }

      .search-bezel__title {
        margin: 0 0 var(--pv-space-2);
        font-size: 1rem;
      }

      .search-form {
        display: grid;
        gap: var(--pv-space-2);
      }

      .search-form__label {
        font-size: 0.875rem;
        font-weight: 700;
      }

      .search-form__row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--pv-space-2);
      }

      .search-form__input {
        flex: 1 1 11rem;
        min-inline-size: 0;
        min-block-size: 2.75rem;
        padding: 0.5rem 0.75rem;
        border-radius: var(--pv-radius-sm);
        border: 1px solid var(--pv-border-subtle);
        background: var(--pv-visor-paper);
        color: var(--pv-ink-on-light);
      }

      .search-form__submit,
      .catalog-box__retry {
        min-block-size: 2.75rem;
        padding: 0.5rem 1rem;
        border: 0;
        border-radius: var(--pv-radius-sm);
        background: var(--pv-dex-red);
        color: var(--pv-ink-on-accent);
        font-weight: 700;
        cursor: pointer;
      }

      .search-form__hint {
        margin: 0;
        font-size: 0.75rem;
        color: var(--pv-ink-muted);
      }

      .search-form__error {
        margin: 0;
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--pv-amber);
      }

      .catalog-box {
        display: flex;
        flex-direction: column;
        gap: var(--pv-space-2);
        padding: var(--pv-space-3);
        border-radius: var(--pv-radius-md);
        background: oklch(91% 0.01 250);
        color: var(--pv-ink-on-light);
      }

      .catalog-box__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--pv-space-2);
        font-size: 0.8125rem;
        font-weight: 700;
      }

      .catalog-list {
        display: grid;
        gap: var(--pv-space-1);
        max-block-size: 16rem;
        overflow-y: auto;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .catalog-list__row {
        content-visibility: auto;
        contain-intrinsic-size: 46px;
      }

      .catalog-list__btn {
        display: flex;
        align-items: center;
        gap: var(--pv-space-2);
        inline-size: 100%;
        min-block-size: 2.75rem;
        padding: 0.5rem 0.75rem;
        border-radius: var(--pv-radius-sm);
        border: 1px solid oklch(78% 0.015 250);
        background: var(--pv-visor-paper);
        color: var(--pv-ink-on-light);
        text-align: start;
        cursor: pointer;
      }

      .catalog-list__btn.is-selected {
        border-color: var(--pv-sapphire);
        background: oklch(90% 0.06 232);
        font-weight: 700;
      }

      .catalog-list__id {
        font-family: var(--pv-font-mono);
        font-size: 0.8125rem;
      }

      .catalog-list__name {
        flex: 1 1 auto;
        min-inline-size: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .catalog-list__approx {
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--pv-dex-red-deep);
      }

      .catalog-list__empty {
        padding: var(--pv-space-3);
        text-align: center;
        font-size: 0.875rem;
      }
    `,
  ],
})
export class PokedexSearchPanelComponent {
  readonly store = inject(PokedexStore);
  readonly showValidationError = signal(false);

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.store.setQuery(value);
    if (value.trim()) {
      this.showValidationError.set(false);
    }
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    const raw = this.store.query();
    if (!raw.trim()) {
      this.showValidationError.set(true);
      return;
    }
    this.showValidationError.set(false);
    this.store.searchOrSelect(raw);
  }

  padId(id: number): string {
    return String(id).padStart(4, '0');
  }

  catalogStatusLabel(): string {
    const state = this.store.catalogState();
    switch (state.status) {
      case 'loading':
        return 'Sincronizando PokéAPI...';
      case 'error':
        return 'Erro ao carregar catálogo';
      case 'success': {
        const filtered = this.store.filteredCatalog();
        return this.store.query().trim()
          ? `Resultados (${filtered.items.length})`
          : `Todos os Pokémon (${state.data.length})`;
      }
      default:
        return 'Catálogo pronto';
    }
  }
}
