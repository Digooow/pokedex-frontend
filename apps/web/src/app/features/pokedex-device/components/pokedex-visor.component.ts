import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import type { AsyncState, SearchablePokemonItem } from '@pokeverse/shared';
import { PokedexRpgNavService } from '../services/pokedex-rpg-nav.service';
import { PokedexSlotsStore } from '../services/pokedex-slots.store';
import type { PokemonDetailView } from '../services/pokedex.store';
import { PokedexSlotsConfigComponent } from './pokedex-slots-config.component';

/** Right-wing LCD CRT Visor showing empty Pokéball, skeleton, 404/API alerts, Pokémon sheet, or Slots Editor. */
@Component({
  selector: 'pv-pokedex-visor',
  imports: [PokedexSlotsConfigComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1 1 0;
        min-height: 0;
        width: 100%;
      }
    `,
  ],
  template: `
    <section
      id="resultado-area"
      class="painel-resultado"
      [class.is-rpg-tela-cursor]="rpg.isScreenHighlighted('visor')"
      [class.is-selecionando-pokemon]="rpg.isVisorSelectingList()"
      aria-labelledby="titulo-resultado"
      (click)="rpg.setScreenFocus('visor', 'itens')"
    >
      <div class="painel-cabecalho">
        <h2 id="titulo-resultado" class="painel-titulo">Visor de Resultados</h2>
        <span id="status-badge" [class]="'status-badge status-badge--' + badgeVariant()">
          {{ badgeLabel() }}
        </span>
      </div>

      <div
        id="resultado-conteudo"
        class="resultado-conteudo"
        aria-live="polite"
        [attr.aria-busy]="detailState().status === 'loading'"
      >
        @if (slotsStore.editMode()) {
          <pv-pokedex-slots-config
            (closeRequested)="slotsStore.setEditMode(false)"
            (slotOpened)="slotOpened.emit($event)"
          />
        } @else {
          @switch (detailState().status) {
            @case ('empty') {
              <div class="estado-vazio">
                <svg class="estado-icone" viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="4" />
                  <path d="M4 32h20m16 0h20" stroke="currentColor" stroke-width="4" />
                  <circle cx="32" cy="32" r="8" fill="none" stroke="currentColor" stroke-width="4" />
                </svg>
                <h3>Nenhum Pokémon no visor</h3>
                <p>
                  Pesquise um Pokémon no módulo de busca ao lado ou selecione um da lista para exibir
                  os dados da PokéAPI aqui no visor.
                </p>
              </div>
            }

            @case ('idle') {
              <div class="estado-vazio">
                <svg class="estado-icone" viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="4" />
                  <path d="M4 32h20m16 0h20" stroke="currentColor" stroke-width="4" />
                  <circle cx="32" cy="32" r="8" fill="none" stroke="currentColor" stroke-width="4" />
                </svg>
                <h3>Nenhum Pokémon no visor</h3>
                <p>
                  Pesquise um Pokémon no módulo de busca ao lado ou selecione um da lista para exibir
                  os dados da PokéAPI aqui no visor.
                </p>
              </div>
            }

            @case ('loading') {
              <div class="skeleton-card" aria-label="Carregando dados do Pokémon na PokéAPI">
                <div class="skeleton-cabecalho">
                  <div class="skeleton-bloco skeleton-imagem"></div>
                  <div class="skeleton-resumo">
                    <div class="skeleton-bloco skeleton-linha skeleton-linha--curta"></div>
                    <div class="skeleton-bloco skeleton-linha skeleton-linha--media"></div>
                    <div class="skeleton-bloco skeleton-linha skeleton-linha--curta"></div>
                  </div>
                </div>
                <div class="skeleton-lista">
                  <div class="skeleton-bloco skeleton-item"></div>
                  <div class="skeleton-bloco skeleton-item"></div>
                  <div class="skeleton-bloco skeleton-item"></div>
                  <div class="skeleton-bloco skeleton-item"></div>
                  <div class="skeleton-bloco skeleton-item"></div>
                </div>
              </div>
            }

            @case ('error') {
              @let notFound = isNotFoundError();
              <div
                [class]="'estado-alerta ' + (notFound ? 'estado-alerta--aviso' : 'estado-alerta--erro')"
                [attr.role]="notFound ? null : 'alert'"
              >
                <span class="alerta-icone" aria-hidden="true">{{ notFound ? '🔎' : '⚠️' }}</span>
                <h3>{{ notFound ? 'Pokémon não encontrado' : 'Erro na comunicação com a API' }}</h3>
                <p>{{ errorMessage() }}</p>

                @if (notFound && suggestions().length > 0) {
                  <div class="sugestoes-404">
                    <span class="sugestoes-404-titulo">Você quis dizer:</span>
                    <div class="sugestoes-404-lista">
                      @for (item of suggestions(); track item.id) {
                        <button
                          type="button"
                          class="btn-sugestao"
                          (click)="onSelectSuggestion($event, item.name)"
                        >
                          #{{ padId(item.id) }} {{ item.displayName }}
                        </button>
                      }
                    </div>
                  </div>
                }

                @if (!notFound) {
                  <button
                    type="button"
                    class="btn-secundario"
                    (click)="onRetryClick($event)"
                  >
                    Tentar novamente
                  </button>
                }
              </div>
            }

            @case ('success') {
              @if (pokemonData(); as pokemon) {
                <article class="pokemon-ficha">
                  <div class="pokemon-cabecalho">
                    <div class="pokemon-imagem-box">
                      @if (activeSpriteUrl(pokemon); as imgUrl) {
                        <img
                          class="pokemon-imagem"
                          [src]="imgUrl"
                          [alt]="'Ilustração oficial de ' + pokemon.displayName"
                          width="124"
                          height="124"
                          fetchpriority="high"
                          (error)="onSpriteError(pokemon)"
                        />
                      } @else {
                        <p class="pokemon-imagem-fallback">
                          {{ imageFailed() ? 'Não foi possível carregar a imagem' : 'Imagem indisponível na API' }}
                        </p>
                      }
                    </div>

                    <div class="pokemon-resumo">
                      <span class="pokemon-id-destaque">{{ pokemon.paddedId }}</span>
                      <h3 class="pokemon-nome">{{ pokemon.displayName }}</h3>
                      @if (pokemon.types.length > 0) {
                        <ul class="pokemon-tipos" aria-label="Tipos do Pokémon">
                          @for (tipo of pokemon.types; track tipo) {
                            <li class="tipo-badge">{{ tipo }}</li>
                          }
                        </ul>
                      }
                    </div>
                  </div>

                  <ul id="pokemon-dados" class="pokemon-lista-dados" aria-label="Dados do Pokémon">
                    <li class="pokemon-dado-item">
                      <span class="dado-rotulo">Nome:</span>
                      <span class="dado-valor">{{ pokemon.displayName }}</span>
                    </li>
                    <li class="pokemon-dado-item">
                      <span class="dado-rotulo">Número de identificação (ID):</span>
                      <span class="dado-valor numero-tabular">{{ pokemon.paddedId }} ({{ pokemon.id }})</span>
                    </li>
                    <li class="pokemon-dado-item">
                      <span class="dado-rotulo">Altura:</span>
                      <span class="dado-valor numero-tabular">{{ pokemon.heightMeters }} ({{ pokemon.heightRawDm }} dm)</span>
                    </li>
                    <li class="pokemon-dado-item">
                      <span class="dado-rotulo">Peso:</span>
                      <span class="dado-valor numero-tabular">{{ pokemon.weightKg }} ({{ pokemon.weightRawHg }} hg)</span>
                    </li>
                    <li class="pokemon-dado-item pokemon-dado-item--habilidades">
                      <span class="dado-rotulo">Habilidades (abilities):</span>
                      @if (pokemon.abilities.length > 0) {
                        <ul class="lista-habilidades">
                          @for (ability of pokemon.abilities; track ability) {
                            <li class="habilidade-item">{{ ability }}</li>
                          }
                        </ul>
                      } @else {
                        <span class="dado-valor">Nenhuma habilidade informada pela API.</span>
                      }
                    </li>
                  </ul>
                </article>
              }
            }
          }
        }
      </div>
    </section>
  `,
})
export class PokedexVisorComponent {
  readonly rpg = inject(PokedexRpgNavService);
  readonly slotsStore = inject(PokedexSlotsStore);

  readonly detailState = input.required<AsyncState<PokemonDetailView>>();
  readonly cacheSource = input<'hit' | 'miss' | 'direct' | null>(null);
  readonly transientStatus = input<{ readonly label: string; readonly variant: 'sucesso' | 'aviso' } | null>(null);
  readonly suggestions = input<readonly SearchablePokemonItem[]>([]);

  readonly retry = output<void>();
  readonly selectSuggestion = output<string>();
  readonly slotOpened = output<string>();

  private readonly usedFallbackSprite = signal(false);
  readonly imageFailed = signal(false);

  constructor() {
    effect(() => {
      this.detailState();
      this.usedFallbackSprite.set(false);
      this.imageFailed.set(false);
    });
  }

  readonly badgeVariant = computed(() => {
    if (this.slotsStore.editMode()) return 'aviso';
    const notice = this.transientStatus();
    if (notice) return notice.variant;
    const state = this.detailState();
    switch (state.status) {
      case 'loading':
        return 'carregando';
      case 'success':
        return 'sucesso';
      case 'error':
        return state.error.code === 'POKEMON_NOT_FOUND' ? 'aviso' : 'erro';
      default:
        return 'aguardando';
    }
  });

  readonly badgeLabel = computed(() => {
    if (this.slotsStore.editMode()) return 'Botões Azuis';
    const notice = this.transientStatus();
    if (notice) return notice.label;
    const state = this.detailState();
    switch (state.status) {
      case 'loading':
        return 'Buscando...';
      case 'success': {
        const src = this.cacheSource();
        return src === 'hit' ? 'Encontrado · Redis' : 'Encontrado';
      }
      case 'error':
        return state.error.code === 'POKEMON_NOT_FOUND' ? 'Não encontrado' : 'Erro na API';
      default:
        return 'Aguardando busca';
    }
  });

  pokemonData(): PokemonDetailView | null {
    const state = this.detailState();
    return state.status === 'success' ? state.data : null;
  }

  isNotFoundError(): boolean {
    const state = this.detailState();
    return state.status === 'error' && state.error.code === 'POKEMON_NOT_FOUND';
  }

  errorMessage(): string {
    const state = this.detailState();
    return state.status === 'error' ? state.error.message : '';
  }

  padId(id: number): string {
    return id > 0 ? String(id).padStart(4, '0') : '----';
  }

  activeSpriteUrl(pokemon: PokemonDetailView): string | null {
    if (this.imageFailed()) return null;
    if (this.usedFallbackSprite()) return pokemon.fallbackSpriteUrl;
    return pokemon.spriteUrl ?? pokemon.fallbackSpriteUrl;
  }

  onSpriteError(pokemon: PokemonDetailView): void {
    if (!this.usedFallbackSprite() && pokemon.fallbackSpriteUrl && pokemon.fallbackSpriteUrl !== pokemon.spriteUrl) {
      this.usedFallbackSprite.set(true);
      return;
    }
    this.imageFailed.set(true);
  }

  onSelectSuggestion(event: Event, name: string): void {
    event.stopPropagation();
    this.selectSuggestion.emit(name);
  }

  onRetryClick(event: Event): void {
    event.stopPropagation();
    this.retry.emit();
  }
}
