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
import {
  PvRpgContainerDirective,
  PvRpgFocusableDirective,
} from '../directives/rpg-focusable.directive';
import { PokedexRpgNavService } from '../services/pokedex-rpg-nav.service';
import {
  type RpgDirection,
  resolveStepBackTargetIdentifier,
} from '../services/pokedex-rpg-nav.util';
import { PokedexStore } from '../services/pokedex.store';
import { PokedexPhysicalControlsComponent } from './pokedex-physical-controls.component';

@Component({
  selector: 'pv-pokedex-search-panel',
  imports: [PvRpgFocusableDirective, PvRpgContainerDirective, PokedexPhysicalControlsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: contents;
      }
    `,
  ],
  templateUrl: './pokedex-search-panel.component.html',
})
export class PokedexSearchPanelComponent {
  readonly store = inject(PokedexStore);
  readonly rpg = inject(PokedexRpgNavService);
  private readonly searchInputEl = viewChild<ElementRef<HTMLInputElement>>('searchInputEl');

  readonly blueAdvanceOrClear = output<void>();
  readonly aConfirm = output<void>();

  readonly forceValidationError = signal(false);
  readonly inputTouched = signal(false);
  readonly nonWhitespacePattern = String.raw`.*\S.*`;

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

  focusInput = () => this.searchInputEl()?.nativeElement.focus();

  stepBackOrClearForm(): void {
    const prev = this.store.previousQuery().trim();
    const currentQuery = this.store.query().trim();
    if (prev && prev.toLowerCase() !== currentQuery.toLowerCase()) {
      const target = this.store.selectedPokemon()?.name ?? currentQuery.toLowerCase();
      this.store.setQuery(this.store.consumePreviousQuery());
      this.rpg.scrollCatalogIndexIntoView(Math.max(0, this.store.findCatalogIndex(target)));
      return;
    }

    if (currentQuery) {
      const highlighted =
        this.store.filteredCatalog().items[this.rpg.rpgCatalogIndex()]?.name ?? null;
      const target = resolveStepBackTargetIdentifier(
        this.store.selectedPokemon()?.name,
        highlighted,
        currentQuery,
      );
      this.resetFormValidation();
      const fullIdx = this.store.findCatalogIndex(target);
      if (fullIdx >= 0) {
        this.store.ensureCatalogIndexVisible(fullIdx);
        this.rpg.scrollCatalogIndexIntoView(fullIdx);
      } else {
        this.rpg.scrollCatalogToTop();
      }
      return;
    }

    this.resetFormValidation();
    this.rpg.rpgLevel.set('telas');
    this.rpg.scrollCatalogToTop();
    this.focusInput();
  }

  formatCatalogId = (id: number) => (id > 0 ? String(id).padStart(4, '0') : '----');

  onFormAreaClick(event: Event): void {
    this.rpg.deactivateKeyboardMode();
    const isSubmitBtn = event.target instanceof HTMLElement && event.target.id === 'btn-buscar';
    this.rpg.setScreenFocus('busca', 'itens', isSubmitBtn ? 1 : 0);
  }

  onCatalogAreaClick(): void {
    this.rpg.deactivateKeyboardMode();
    if (this.rpg.rpgLevel() !== 'itens' || this.rpg.rpgScreen() !== 'lista') {
      this.rpg.setScreenFocus('lista', 'telas');
    }
  }

  onInputFocus = () => this.store.ensureCatalogLoaded();
  onInputBlur = () => {
    if (this.store.query().length > 0) this.inputTouched.set(true);
  };

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.store.setUserQuery(value);
    if (value.trim()) {
      this.forceValidationError.set(false);
      this.inputTouched.set(false);
    }
    this.rpg.onSearchInputEdited();
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
    this.rpg.deactivateKeyboardMode();
    (event.currentTarget as HTMLElement | null)?.blur?.();

    const clickDetail = event instanceof MouseEvent ? event.detail : 1;
    const alreadyHighlighted =
      this.rpg.rpgLevel() === 'itens' &&
      this.rpg.rpgScreen() === 'lista' &&
      this.rpg.rpgCatalogIndex() === index;

    this.rpg.setCatalogCursor(index);
    if (!alreadyHighlighted && clickDetail < 2) return;

    this.forceValidationError.set(false);
    this.store.selectFromCatalog(item.name);
  }

  onCatalogScroll(event: Event): void {
    if (!this.store.hasMoreCatalog()) return;
    const listEl = event.target as HTMLElement;
    if (listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 120)
      this.store.loadMoreCatalog();
  }

  onLoadMore(event: Event): void {
    event.stopPropagation();
    this.rpg.deactivateKeyboardMode();
    this.store.loadMoreCatalog();
  }

  onReloadCatalog(event: Event): void {
    event.stopPropagation();
    this.rpg.deactivateKeyboardMode();
    this.store.ensureCatalogLoaded(true);
  }

  onDpadClick(direction: RpgDirection): void {
    this.rpg.deactivateKeyboardMode();
    this.searchInputEl()?.nativeElement.blur();
    this.rpg.navigate(direction);
  }

  onRedButtonClick(): void {
    this.rpg.deactivateKeyboardMode();
    this.rpg.goBackOrClearForm(() => this.stepBackOrClearForm(), true);
  }

  onBlueButtonClick(): void {
    this.rpg.deactivateKeyboardMode();
    this.blueAdvanceOrClear.emit();
  }

  onAButtonClick(): void {
    this.rpg.deactivateKeyboardMode();
    this.aConfirm.emit();
  }

  private resetFormValidation(): void {
    this.store.clearQuery();
    this.forceValidationError.set(false);
    this.inputTouched.set(false);
  }
}
