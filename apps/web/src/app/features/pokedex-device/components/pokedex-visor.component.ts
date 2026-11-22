import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { AsyncState, SearchablePokemonItem } from '@pokeverse/shared';
import {
  PvRpgContainerDirective,
  PvRpgFocusableDirective,
} from '../directives/rpg-focusable.directive';
import { PokedexRpgNavService } from '../services/pokedex-rpg-nav.service';
import { PokedexSlotsStore } from '../services/pokedex-slots.store';
import type { PokemonDetailView } from '../services/pokedex.store';
import { PokedexSlotsConfigComponent } from './pokedex-slots-config.component';

@Component({
  selector: 'pv-pokedex-visor',
  imports: [PokedexSlotsConfigComponent, PvRpgContainerDirective, PvRpgFocusableDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pokedex-visor.component.html',
  styleUrl: './pokedex-visor.component.scss',
})
export class PokedexVisorComponent {
  readonly rpg = inject(PokedexRpgNavService);
  readonly slotsStore = inject(PokedexSlotsStore);

  readonly detailState = input.required<AsyncState<PokemonDetailView>>();
  readonly cacheSource = input<'hit' | 'miss' | 'direct' | null>(null);
  readonly transientStatus = input<{
    readonly label: string;
    readonly variant: 'sucesso' | 'aviso';
  } | null>(null);
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
    if (
      !this.usedFallbackSprite() &&
      pokemon.fallbackSpriteUrl &&
      pokemon.fallbackSpriteUrl !== pokemon.spriteUrl
    ) {
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
