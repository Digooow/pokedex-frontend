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
import { PokedexFiltersStore } from '../services/pokedex-filters.store';
import { PokedexRpgNavService } from '../services/pokedex-rpg-nav.service';
import {
  type RpgDirection,
  resolveCatalogQuickTarget,
  resolveCatalogStepBackPlan,
} from '../services/pokedex-rpg-nav.util';
import { resolveCatalogStatusLabel } from '../services/pokedex-view-mapper.util';
import { PokedexStore } from '../services/pokedex.store';
import { PokedexFiltersPanelComponent } from './pokedex-filters-panel.component';
import { PokedexPhysicalControlsComponent } from './pokedex-physical-controls.component';

@Component({
  selector: 'pv-pokedex-search-panel',
  imports: [
    PvRpgFocusableDirective,
    PvRpgContainerDirective,
    PokedexPhysicalControlsComponent,
    PokedexFiltersPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: contents; }'],
  templateUrl: './pokedex-search-panel.component.html',
})
export class PokedexSearchPanelComponent {
  readonly store = inject(PokedexStore);
  readonly filters = inject(PokedexFiltersStore);
  readonly rpg = inject(PokedexRpgNavService);
  private readonly searchInputEl = viewChild<ElementRef<HTMLInputElement>>('searchInputEl');

  readonly blueAdvanceOrClear = output<void>();
  readonly aConfirm = output<void>();
  readonly sendToHolocron = output<string>();
  readonly sendToCompare = output<string>();

  readonly forceValidationError = signal(false);
  readonly inputTouched = signal(false);
  readonly nonWhitespacePattern = String.raw`.*\S.*`;

  readonly isSearching = computed(() => this.store.detailState().status === 'loading');
  readonly quickTarget = computed(() =>
    resolveCatalogQuickTarget(
      this.store.selectedPokemon(),
      this.store.filteredCatalog().items,
      this.rpg.rpgCatalogIndex(),
    ),
  );
  readonly showFieldError = computed(
    () => !this.store.query().trim() && (this.forceValidationError() || this.inputTouched()),
  );
  readonly remainingCount = computed(() =>
    Math.max(0, this.store.catalogTotalCount() - this.store.filteredCatalog().items.length),
  );
  readonly catalogStatusText = computed(() =>
    resolveCatalogStatusLabel({
      hasActiveFilters: this.filters.hasActiveFilters(),
      enrichedStatus: this.filters.enrichedState().status,
      catalogStatus: this.store.catalogState().status,
      totalCount: this.store.catalogTotalCount(),
      term: this.store.query().trim(),
      filteredCount: this.store.filteredCatalog().items.length,
      filterMode: this.store.filteredCatalog().mode,
    }),
  );

  focusInput = () => this.searchInputEl()?.nativeElement.focus();

  stepBackOrClearForm(): void {
    const plan = resolveCatalogStepBackPlan({
      prevQuery: this.store.previousQuery(),
      currentQuery: this.store.query(),
      selectedName: this.store.selectedPokemon()?.name,
      highlightedName: this.store.filteredCatalog().items[this.rpg.rpgCatalogIndex()]?.name ?? null,
    });
    if (plan.kind === 'restore-prev') {
      this.store.setQuery(this.store.consumePreviousQuery());
      this.rpg.scrollCatalogIndexIntoView(Math.max(0, this.store.findCatalogIndex(plan.target)));
      return;
    }
    this.resetFormValidation();
    if (plan.kind === 'clear-to-target') {
      const fullIdx = this.store.findCatalogIndex(plan.target);
      if (fullIdx >= 0) {
        this.store.ensureCatalogIndexVisible(fullIdx);
        this.rpg.scrollCatalogIndexIntoView(fullIdx);
        return;
      }
      this.rpg.scrollCatalogToTop();
      return;
    }
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

  onAreaKeyDown(screen: 'busca' | 'lista', event: KeyboardEvent): void {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.rpg.setScreenFocus(screen, 'itens');
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
      return this.focusInput();
    }
    this.forceValidationError.set(false);
    this.store.searchOrSelect(raw);
  }

  onCatalogItemClick(item: CatalogMatchItem, index: number, event: Event): void {
    event.stopPropagation();
    this.rpg.deactivateKeyboardMode();
    (event.currentTarget as HTMLElement | null)?.blur?.();
    const clickDetail = event instanceof MouseEvent ? event.detail : 1;
    const already =
      this.rpg.rpgLevel() === 'itens' &&
      this.rpg.rpgScreen() === 'lista' &&
      this.rpg.rpgCatalogIndex() === index;
    this.rpg.setCatalogCursor(index);
    if (!already && clickDetail < 2) return;
    this.forceValidationError.set(false);
    this.store.selectFromCatalog(item.name);
  }

  onCatalogScroll(event: Event): void {
    if (!this.store.hasMoreCatalog()) return;
    const el = event.target as HTMLElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) this.store.loadMoreCatalog();
  }

  onLoadMore = (e: Event) => this.runAction(e, () => this.store.loadMoreCatalog());
  onReloadCatalog = (e: Event) => this.runAction(e, () => this.store.ensureCatalogLoaded(true));
  onToggleFilters = (e: Event) => this.runAction(e, () => this.filters.togglePanel());
  onBlueButtonClick = () => this.runPhysical(() => this.blueAdvanceOrClear.emit());
  onAButtonClick = () => this.runPhysical(() => this.aConfirm.emit());
  onRedButtonClick = () =>
    this.runPhysical(() => this.rpg.goBackOrClearForm(() => this.stepBackOrClearForm(), true));

  onSendQuickAction(target: 'holocron' | 'compare', event: Event): void {
    this.runAction(event, () => {
      const current = this.quickTarget();
      if (!current) return;
      if (target === 'holocron') this.sendToHolocron.emit(current.name);
      else this.sendToCompare.emit(current.name);
    });
  }

  onDpadClick(direction: RpgDirection): void {
    this.rpg.deactivateKeyboardMode();
    this.searchInputEl()?.nativeElement.blur();
    this.rpg.navigate(direction);
  }

  private runAction(event: Event, fn: () => void): void {
    event.stopPropagation();
    this.rpg.deactivateKeyboardMode();
    fn();
  }

  private runPhysical(fn: () => void): void {
    this.rpg.deactivateKeyboardMode();
    fn();
  }

  private resetFormValidation(): void {
    this.store.clearQuery();
    this.forceValidationError.set(false);
    this.inputTouched.set(false);
  }
}
