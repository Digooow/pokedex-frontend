import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import type { AsyncState, SearchablePokemonItem } from '@pokeverse/shared';
import { QualityStore } from '../../../core/stores/quality.store';
import {
  PvRpgContainerDirective,
  PvRpgFocusableDirective,
} from '../directives/rpg-focusable.directive';
import { PokedexRpgNavService } from '../services/pokedex-rpg-nav.service';
import { PokedexSlotsStore } from '../services/pokedex-slots.store';
import type { PokedexCacheSource, PokemonDetailView } from '../services/pokedex-view-mapper.util';
import { PokedexVisorDetailStore } from '../services/pokedex-visor-detail.store';
import {
  VISOR_MODES,
  VISOR_TABS,
  type VisorModeId,
  type VisorTabId,
} from '../services/pokedex-visor-format.util';
import { PokedexSlotsConfigComponent } from './pokedex-slots-config.component';
import { PokedexComparePanelComponent } from './visor-modes/pokedex-compare-panel.component';
import { PokedexEncyclopediaPanelComponent } from './visor-modes/pokedex-encyclopedia-panel.component';
import { PokedexHolocronPanelComponent } from './visor-modes/pokedex-holocron-panel.component';
import { PokedexStatCalcPanelComponent } from './visor-modes/pokedex-stat-calc-panel.component';
import { VisorEvolutionTabComponent } from './visor-tabs/visor-evolution-tab.component';
import { VisorMapTabComponent } from './visor-tabs/visor-map-tab.component';
import { VisorMovesTabComponent } from './visor-tabs/visor-moves-tab.component';
import { VisorOverviewTabComponent } from './visor-tabs/visor-overview-tab.component';
import { VisorStatsTabComponent } from './visor-tabs/visor-stats-tab.component';

@Component({
  selector: 'pv-pokedex-visor',
  imports: [
    PokedexSlotsConfigComponent,
    PokedexHolocronPanelComponent,
    PokedexComparePanelComponent,
    PokedexStatCalcPanelComponent,
    PokedexEncyclopediaPanelComponent,
    PvRpgContainerDirective,
    PvRpgFocusableDirective,
    VisorOverviewTabComponent,
    VisorStatsTabComponent,
    VisorEvolutionTabComponent,
    VisorMovesTabComponent,
    VisorMapTabComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pokedex-visor.component.html',
  styleUrl: './pokedex-visor.component.scss',
})
export class PokedexVisorComponent {
  readonly rpg = inject(PokedexRpgNavService);
  readonly slotsStore = inject(PokedexSlotsStore);
  readonly visorDetail = inject(PokedexVisorDetailStore);
  private readonly quality = inject(QualityStore);

  readonly detailState = input.required<AsyncState<PokemonDetailView>>();
  readonly cacheSource = input<PokedexCacheSource | null>(null);
  readonly transientStatus = input<{
    readonly label: string;
    readonly variant: 'sucesso' | 'aviso';
  } | null>(null);
  readonly suggestions = input<readonly SearchablePokemonItem[]>([]);
  readonly encyclopediaCategory = input<string | null>(null);
  readonly encyclopediaItem = input<string | null>(null);

  readonly retry = output<void>();
  readonly selectSuggestion = output<string>();
  readonly slotOpened = output<string>();
  readonly compareRequested = output<PokemonDetailView>();
  readonly holocronRequested = output<PokemonDetailView>();
  readonly calculatorRequested = output<void>();

  readonly modes = VISOR_MODES;
  readonly tabs = VISOR_TABS;
  readonly isLite = computed(() => this.quality.tier() === 'lite');
  readonly emptyStateTitle = 'Nenhum Pokémon no visor';
  readonly emptyStateDescription =
    'Pesquise um Pokémon no módulo de busca ao lado ou selecione um da lista para exibir os dados da PokéAPI aqui no visor.';

  constructor() {
    effect(() => {
      const state = this.detailState();
      const activeName = state.status === 'success' ? state.data.name : null;
      untracked(() => this.visorDetail.resetForPokemon(activeName));
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
        if (src === 'hit') return 'Encontrado · Redis';
        if (src === 'stale-fallback') return 'Encontrado · Reserva';
        return 'Encontrado';
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

  isNotFoundError = (): boolean => {
    const state = this.detailState();
    return state.status === 'error' && state.error.code === 'POKEMON_NOT_FOUND';
  };

  errorMessage = (): string => {
    const state = this.detailState();
    return state.status === 'error' ? state.error.message : '';
  };

  padId = (id: number): string => (id > 0 ? String(id).padStart(4, '0') : '----');

  onSelectMode(modeId: VisorModeId, event: Event): void {
    event.stopPropagation();
    const pk = this.pokemonData();
    if (modeId === 'holocron' && pk) this.holocronRequested.emit(pk);
    else if (modeId === 'comparar' && pk) this.compareRequested.emit(pk);
    else this.visorDetail.setMode(modeId);
  }

  onSelectFromMode(pokemonName: string): void {
    this.visorDetail.setMode('ficha');
    this.selectSuggestion.emit(pokemonName);
  }

  onSelectTab(tabId: VisorTabId, pokemonName: string, event: Event): void {
    event.stopPropagation();
    this.visorDetail.selectTab(tabId, pokemonName);
  }

  onTabKeyDown(event: KeyboardEvent, pokemonName: string): void {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      this.visorDetail.stepTab(event.key === 'ArrowRight' ? 1 : -1, pokemonName);
      return;
    }
    if (event.key === 'Home' && this.tabs[0]) {
      event.preventDefault();
      event.stopPropagation();
      this.visorDetail.selectTab(this.tabs[0].id, pokemonName);
      return;
    }
    const lastTab = this.tabs.at(-1);
    if (event.key === 'End' && lastTab) {
      event.preventDefault();
      event.stopPropagation();
      this.visorDetail.selectTab(lastTab.id, pokemonName);
    }
  }

  onSelectSuggestion(event: Event, name: string): void {
    event.stopPropagation();
    this.selectSuggestion.emit(name);
  }

  onSelectSpecies = (name: string) => this.selectSuggestion.emit(name);

  onRetryClick(event: Event): void {
    event.stopPropagation();
    this.retry.emit();
  }

  onVisorKeyDown(event: KeyboardEvent): void {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.rpg.setScreenFocus('visor', 'itens');
  }
}
