import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { type AsyncState, formatPokeApiText } from '@pokeverse/shared';
import type { MoveDetail } from '@pokeverse/shared/pokedex-encyclopedia';
import { resolvePokemonTypeSlug } from '../../../../shared/utils/pokemon-type-style.util';
import { PvRpgFocusableDirective } from '../../directives/rpg-focusable.directive';
import type { PokemonDetailView } from '../../services/pokedex-view-mapper.util';
import {
  type MoveLearnMethodTab,
  groupMovesByLearnMethod,
} from '../../services/pokedex-visor-format.util';

const MOVES_PAGE_SIZE = 20;

const METHOD_TABS: readonly { readonly id: MoveLearnMethodTab; readonly label: string }[] = [
  { id: 'level-up', label: 'Nível' },
  { id: 'machine', label: 'TM/HM' },
  { id: 'egg', label: 'Ovo' },
  { id: 'tutor', label: 'Tutor' },
];

@Component({
  selector: 'pv-visor-moves-tab',
  imports: [PvRpgFocusableDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    ':host { display: flex; flex-direction: column; gap: var(--pv-space-3); min-width: 0; }',
  ],
  templateUrl: './visor-moves-tab.component.html',
})
export class VisorMovesTabComponent {
  readonly typeSlug = resolvePokemonTypeSlug;
  readonly pokemon = input.required<PokemonDetailView>();
  readonly moveDetails = input.required<Readonly<Record<string, AsyncState<MoveDetail>>>>();

  readonly inspectMove = output<string>();

  readonly methodTabs = METHOD_TABS;
  readonly selectedMethod = signal<MoveLearnMethodTab>('level-up');
  readonly visibleLimit = signal(MOVES_PAGE_SIZE);
  readonly expandedMove = signal<string | null>(null);

  constructor() {
    let lastId: number | null = null;
    effect(() => {
      const id = this.pokemon().id;
      if (id !== lastId) {
        lastId = id;
        this.selectedMethod.set('level-up');
        this.visibleLimit.set(MOVES_PAGE_SIZE);
        this.expandedMove.set(null);
      }
    });
  }

  readonly groupedMoves = computed(() =>
    groupMovesByLearnMethod(this.pokemon().bundle?.pokemon.moves ?? []),
  );

  readonly activeMoves = computed(() => this.groupedMoves()[this.selectedMethod()]);
  readonly visibleMoves = computed(() => this.activeMoves().slice(0, this.visibleLimit()));
  readonly hasMoreMoves = computed(() => this.visibleMoves().length < this.activeMoves().length);

  readonly heldItems = computed(() => {
    const items = this.pokemon().bundle?.pokemon.heldItems ?? [];
    return items.map((entry) => {
      const maxRarity = entry.versionDetails.reduce((max, vd) => Math.max(max, vd.rarity), 0);
      return {
        name: entry.itemName,
        displayName: formatPokeApiText(entry.itemName),
        maxRarity,
      };
    });
  });

  selectMethod(method: MoveLearnMethodTab): void {
    this.selectedMethod.set(method);
    this.visibleLimit.set(MOVES_PAGE_SIZE);
    this.expandedMove.set(null);
  }

  showMoreMoves(): void {
    this.visibleLimit.update((curr) => curr + MOVES_PAGE_SIZE);
  }

  toggleMove(moveName: string): void {
    if (this.expandedMove() === moveName) {
      this.expandedMove.set(null);
      return;
    }
    this.expandedMove.set(moveName);
    this.inspectMove.emit(moveName);
  }

  moveState(moveName: string): AsyncState<MoveDetail> | null {
    return this.moveDetails()[moveName] ?? null;
  }

  formatType = (raw: string | null): string => (raw ? formatPokeApiText(raw) : '—');
}
