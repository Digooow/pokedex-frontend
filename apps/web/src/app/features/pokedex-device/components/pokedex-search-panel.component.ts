import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { CatalogMatchItem } from '@pokeverse/shared';
import { PokedexRpgNavService } from '../services/pokedex-rpg-nav.service';
import { PokedexStore } from '../services/pokedex.store';

/** Left scanner wing (.aba-face--verso): optical camera + LEDs, fuzzy catalog search, and tactile keypad controls. */
@Component({
  selector: 'pv-pokedex-search-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: contents;
      }
    `,
  ],
  template: `
    <div
      id="pokedex-ala-scanner"
      class="aba-face aba-face--verso pokedex-ala pokedex-ala--scanner"
      [inert]="!store.coverOpen()"
      title="Clique na carcaça fora das telas e botões para fechar a Pokédex"
    >
      <header class="ala-topo ala-topo--scanner">
        <div class="pokedex-luzes" aria-hidden="true">
          <span class="camera-lente-principal">
            <span class="camera-anel-externo">
              <span class="camera-barril-optico">
                <span class="camera-vidro-safira"></span>
              </span>
            </span>
          </span>
          <span class="luz-trio">
            <span class="luz luz--vermelha"></span>
            <span class="luz luz--amarela"></span>
            <span class="luz luz--verde"></span>
          </span>
        </div>
        <div class="pokedex-titulo-grupo">
          <span class="capa-titulo">Módulo de Busca</span>
        </div>
      </header>

      <section class="painel-busca" aria-labelledby="titulo-busca">
        <div
          id="painel-busca-form"
          class="painel-busca-form"
          [class.is-rpg-tela-cursor]="rpg.isScreenHighlighted('busca')"
          (click)="onFormAreaClick($event)"
        >
          <div class="painel-cabecalho">
            <h2 id="titulo-busca" class="painel-titulo">Pesquisar Pokémon</h2>
          </div>

          <search>
            <form id="form-pokedex" class="form-pokedex" novalidate (submit)="onSubmit($event)">
              <label for="pokemon-input" class="campo-label">
                Nome ou ID <span aria-hidden="true">*</span>
              </label>
              <div class="campo-linha">
                <input
                  #searchInputEl
                  type="text"
                  id="pokemon-input"
                  name="pokemon"
                  class="campo-input"
                  [class.user-invalid-fallback]="showFieldError()"
                  [value]="store.query()"
                  placeholder="Ex.: pikachu, pikaxu ou 25"
                  required
                  pattern=".*\\S.*"
                  autocorrect="off"
                  autocapitalize="none"
                  spellcheck="false"
                  enterkeyhint="search"
                  [attr.aria-describedby]="showFieldError() ? 'pokemon-dica pokemon-erro-campo' : 'pokemon-dica'"
                  [attr.aria-invalid]="showFieldError() ? 'true' : 'false'"
                  data-error="pokemon-erro-campo"
                  (focus)="onInputFocus()"
                  (blur)="onInputBlur()"
                  (input)="onInput($event)"
                />
                <button
                  type="submit"
                  id="btn-buscar"
                  class="btn-primario"
                  [disabled]="isSearching()"
                >
                  {{ isSearching() ? 'Buscando...' : 'Buscar Pokémon' }}
                </button>
              </div>
              <p id="pokemon-dica" class="campo-dica">
                Filtre a lista abaixo ao digitar (aceita aproximação) ou use as setas para navegar.
              </p>
              <div id="pokemon-erro-campo" class="mensagem-campo-erro" aria-live="polite">
                <span aria-hidden="true">❌</span>
                <span id="pokemon-erro-texto">Informe o nome de um Pokémon antes de pesquisar.</span>
              </div>
            </form>
          </search>
        </div>

        <div
          id="pokemon-catalogo-area"
          class="pokemon-catalogo-area"
          [class.is-rpg-tela-cursor]="rpg.isScreenHighlighted('lista')"
          (click)="rpg.setScreenFocus('lista', 'itens')"
        >
          <div class="catalogo-cabecalho">
            <span id="catalogo-status" class="catalogo-status">{{ catalogStatusText() }}</span>
            <button
              type="button"
              id="btn-recarregar-catalogo"
              class="btn-catalogo-recarregar"
              [hidden]="store.catalogState().status !== 'error'"
              (click)="onReloadCatalog($event)"
            >
              Recarregar
            </button>
          </div>

          <ul
            id="pokemon-catalogo"
            class="pokemon-catalogo-lista"
            aria-label="Lista de Pokémon disponíveis na PokéAPI"
            (scroll)="onCatalogScroll($event)"
          >
            @switch (store.catalogState().status) {
              @case ('loading') {
                <li class="catalogo-vazio">Carregando catálogo da PokéAPI...</li>
              }
              @case ('error') {
                <li class="catalogo-vazio">
                  Não foi possível carregar a lista completa agora. Você ainda pode buscar pelo nome acima.
                </li>
              }
              @case ('success') {
                @let filtered = store.filteredCatalog();
                @if (filtered.items.length === 0) {
                  <li class="catalogo-vazio">
                    Nenhum Pokémon parecido foi localizado na lista. Você ainda pode pesquisar diretamente acima.
                  </li>
                } @else {
                  @for (item of filtered.items; track item.id; let idx = $index) {
                    <li class="catalogo-item-wrapper">
                      <button
                        type="button"
                        class="catalogo-item"
                        [class.is-selecionado]="store.selectedId() === item.id"
                        [class.is-cursor]="rpg.rpgCatalogIndex() === idx"
                        [class.is-rpg-foco]="rpg.isVisorSelectingList() && rpg.rpgCatalogIndex() === idx"
                        [attr.aria-current]="store.selectedId() === item.id ? 'true' : null"
                        (click)="onCatalogItemClick(item, idx, $event)"
                      >
                        <span class="catalogo-item-esquerda">
                          <span class="catalogo-item-id">#{{ formatCatalogId(item.id) }}</span>
                          <span class="catalogo-item-nome">{{ item.displayName }}</span>
                        </span>
                        @if (item.approximate) {
                          <span class="catalogo-item-tag">Aproximado</span>
                        }
                      </button>
                    </li>
                  }

                  @if (store.hasMoreCatalog()) {
                    <li class="catalogo-item-wrapper">
                      <button
                        type="button"
                        class="btn-catalogo-mais"
                        (click)="onLoadMore($event)"
                      >
                        Carregar mais Pokémon (restam {{ remainingCount() }})
                      </button>
                    </li>
                  }
                }
              }
            }
          </ul>
        </div>
      </section>

      <div class="pokedex-controles-fisicos">
        <fieldset class="controle-dpad controle-interativo">
          <legend class="visually-hidden">Navegar pelos menus e botões da Pokédex</legend>
          <button
            type="button"
            id="btn-dpad-cima"
            class="dpad-btn dpad-btn--cima"
            aria-label="Mover seleção para cima"
            title="Cima (↑)"
            (click)="onDpadClick('cima', $event)"
          >
            ▲
          </button>
          <button
            type="button"
            id="btn-dpad-direita"
            class="dpad-btn dpad-btn--direita"
            aria-label="Mover seleção para a direita"
            title="Direita (→)"
            (click)="onDpadClick('direita', $event)"
          >
            ▶
          </button>
          <button
            type="button"
            id="btn-dpad-baixo"
            class="dpad-btn dpad-btn--baixo"
            aria-label="Mover seleção para baixo"
            title="Baixo (↓)"
            (click)="onDpadClick('baixo', $event)"
          >
            ▼
          </button>
          <button
            type="button"
            id="btn-dpad-esquerda"
            class="dpad-btn dpad-btn--esquerda"
            aria-label="Mover seleção para a esquerda"
            title="Esquerda (←)"
            (click)="onDpadClick('esquerda', $event)"
          >
            ◀
          </button>
          <span class="dpad-miolo" aria-hidden="true"></span>
        </fieldset>

        <div class="controle-fendas controle-interativo">
          <button
            type="button"
            id="btn-limpar-form"
            class="btn-fenda btn-fenda--vermelha"
            aria-label="Voltar menu ou limpar formulário"
            [title]="rpg.redButtonTooltip()"
            (click)="onRedButtonClick($event)"
          ></button>
          <button
            type="button"
            id="btn-limpar-visor"
            class="btn-fenda btn-fenda--azul"
            aria-label="Avançar menu ou limpar visor"
            [title]="rpg.blueButtonTooltip()"
            (click)="onBlueButtonClick($event)"
          ></button>
        </div>

        <button
          type="button"
          id="btn-controle-selecionar"
          class="controle-botao-a controle-interativo"
          aria-label="Confirmar ou selecionar item destacado"
          title="Confirmar / Selecionar (Enter)"
          (click)="onAButtonClick($event)"
        ></button>
      </div>
    </div>
  `,
})
export class PokedexSearchPanelComponent {
  readonly store = inject(PokedexStore);
  readonly rpg = inject(PokedexRpgNavService);

  private readonly searchInputEl = viewChild<ElementRef<HTMLInputElement>>('searchInputEl');

  readonly blueAdvanceOrClear = output<void>();
  readonly aConfirm = output<void>();

  readonly forceValidationError = signal(false);
  readonly inputTouched = signal(false);

  readonly isSearching = computed(() => this.store.detailState().status === 'loading');

  readonly showFieldError = computed(
    () => !this.store.query().trim() && (this.forceValidationError() || this.inputTouched()),
  );

  readonly remainingCount = computed(() =>
    Math.max(0, this.store.catalogTotalCount() - this.store.filteredCatalog().items.length),
  );

  readonly catalogStatusText = computed(() => {
    const state = this.store.catalogState();
    if (state.status === 'loading') return 'Carregando lista da PokéAPI...';
    if (state.status === 'error') return 'Não foi possível carregar a lista completa agora.';
    if (state.status !== 'success') return 'Aguardando abertura do módulo...';

    const term = this.store.query().trim();
    const filtered = this.store.filteredCatalog();
    if (!term) return `Todos os Pokémon (${this.store.catalogTotalCount()})`;
    if (filtered.items.length === 0) return `Nenhum match para "${term}"`;
    if (filtered.mode === 'approximate') return `Sugestões aproximadas (${filtered.items.length})`;
    return `${filtered.items.length} Pokémon encontrados`;
  });

  focusInput(): void {
    this.searchInputEl()?.nativeElement.focus();
  }

  clearForm(): void {
    this.store.clearQuery();
    this.forceValidationError.set(false);
    this.inputTouched.set(false);
    this.rpg.rpgCatalogIndex.set(0);
    this.focusInput();
  }

  formatCatalogId(id: number): string {
    return id > 0 ? String(id).padStart(4, '0') : '----';
  }

  onFormAreaClick(event: Event): void {
    const isSubmitBtn = event.target instanceof HTMLElement && event.target.id === 'btn-buscar';
    this.rpg.setScreenFocus('busca', 'itens', isSubmitBtn ? 1 : 0);
  }

  onInputFocus(): void {
    this.store.ensureCatalogLoaded();
  }

  onInputBlur(): void {
    if (this.store.query().length > 0) {
      this.inputTouched.set(true);
    }
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.store.setQuery(value);
    if (value.trim()) {
      this.forceValidationError.set(false);
      this.inputTouched.set(false);
    }
    this.rpg.rpgLevel.set('itens');
    this.rpg.rpgScreen.set('busca');
    this.rpg.rpgControlIndices.update((prev) => ({ ...prev, busca: 0 }));
    this.store.ensureCatalogLoaded();
    this.rpg.syncFocusVisuals(false);
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    const raw = this.store.query().trim();
    if (!raw) {
      this.forceValidationError.set(true);
      this.focusInput();
      return;
    }
    this.forceValidationError.set(false);
    this.store.searchOrSelect(raw);
  }

  onCatalogItemClick(item: CatalogMatchItem, index: number, event: Event): void {
    event.stopPropagation();
    this.rpg.setCatalogCursor(index);
    this.forceValidationError.set(false);
    this.store.setQuery(item.name);
    this.store.loadPokemonDetail(item.name);
  }

  onCatalogScroll(event: Event): void {
    if (!this.store.hasMoreCatalog()) {
      return;
    }
    const listEl = event.target as HTMLElement;
    const distanceToBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
    if (distanceToBottom < 120) {
      this.store.loadMoreCatalog();
    }
  }

  onLoadMore(event: Event): void {
    event.stopPropagation();
    this.store.loadMoreCatalog();
  }

  onReloadCatalog(event: Event): void {
    event.stopPropagation();
    this.store.ensureCatalogLoaded(true);
  }

  onDpadClick(direction: 'cima' | 'baixo' | 'esquerda' | 'direita', event: Event): void {
    event.stopPropagation();
    this.searchInputEl()?.nativeElement.blur();
    this.rpg.navigate(direction);
  }

  onRedButtonClick(event: Event): void {
    event.stopPropagation();
    this.rpg.goBackOrClearForm(() => this.clearForm());
  }

  onBlueButtonClick(event: Event): void {
    event.stopPropagation();
    this.blueAdvanceOrClear.emit();
  }

  onAButtonClick(event: Event): void {
    event.stopPropagation();
    this.aConfirm.emit();
  }
}
