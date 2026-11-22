import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { PvMainHeadingDirective } from '../../shared/directives/main-heading.directive';
import { PokedexCoverComponent } from './components/pokedex-cover.component';
import { PokedexSearchPanelComponent } from './components/pokedex-search-panel.component';
import {
  PokedexSlotsGridComponent,
  type SlotFeedbackNotice,
} from './components/pokedex-slots-grid.component';
import { PokedexVisorComponent } from './components/pokedex-visor.component';
import { SlotConfirmDialogComponent } from './components/slot-confirm-dialog.component';
import { PokedexInputShortcutsService } from './services/pokedex-input-shortcuts.service';
import { PokedexRpgNavService } from './services/pokedex-rpg-nav.service';
import { PokedexSlotsStore } from './services/pokedex-slots.store';
import { PokedexStore } from './services/pokedex.store';

@Component({
  selector: 'pv-pokedex-device',
  imports: [
    PokedexCoverComponent,
    PokedexSearchPanelComponent,
    PokedexSlotsGridComponent,
    PokedexVisorComponent,
    SlotConfirmDialogComponent,
    PvMainHeadingDirective,
  ],
  providers: [PokedexRpgNavService, PokedexInputShortcutsService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pokedex-device.component.html',
})
export class PokedexDevicePageComponent implements OnInit, OnDestroy {
  readonly store = inject(PokedexStore);
  readonly slotsStore = inject(PokedexSlotsStore);
  readonly rpg = inject(PokedexRpgNavService);
  private readonly shortcuts = inject(PokedexInputShortcutsService);
  private readonly route = inject(ActivatedRoute);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly aparelhoEl = viewChild<ElementRef<HTMLElement>>('aparelhoEl');
  private readonly searchPanelCmp = viewChild<PokedexSearchPanelComponent>('searchPanelCmp');
  private readonly coverCmp = viewChild<PokedexCoverComponent>('coverCmp');

  readonly isScanning = computed(() => this.store.detailState().status === 'loading');
  readonly transientBadge = signal<SlotFeedbackNotice | null>(null);

  private transientTimer: ReturnType<typeof setTimeout> | null = null;
  private querySub: Subscription | null = null;

  constructor() {
    effect(() => {
      const selected = this.store.selectedPokemon();
      if (!selected) return;
      untracked(() => {
        this.transientBadge.set(null);
        this.rpg.syncCatalogSelection(selected.name);
      });
    });

    effect(() => {
      const el = this.aparelhoEl()?.nativeElement;
      if (el) this.rpg.attachHost(el);
    });
  }

  ngOnInit(): void {
    const initialData = this.route.snapshot.data['initialCoverOpen'];
    const initialQuery = this.route.snapshot.queryParamMap.get('q')?.trim() ?? '';

    if (initialQuery) {
      this.openInitialSearch(initialQuery);
    } else if (typeof initialData === 'boolean') {
      this.store.setCoverOpen(initialData);
      if (initialData) this.store.ensureCatalogLoaded();
    } else {
      this.store.setCoverOpen(false);
    }

    this.querySub = this.route.queryParamMap.subscribe((params) => {
      const q = params.get('q')?.trim();
      if (q && q !== this.store.lastSearchedTerm()) this.openInitialSearch(q);
    });

    this.slotsStore.loadSlots();
    this.shortcuts.attach({
      onClose: (returnFocus) => this.closePokedex(returnFocus),
      onStepBack: () => this.searchPanelCmp()?.stepBackOrClearForm(),
      onConfirmA: () => this.onAControl(),
    });
  }

  onDeviceEscape(event: Event): void {
    if (!this.store.coverOpen() || this.shortcuts.isAnyModalOpen()) return;
    event.stopPropagation();
    this.closePokedex(true);
  }

  openPokedex = () => this.rpg.openCover(() => this.searchPanelCmp()?.focusInput());

  closePokedex(returnFocusToCover = true): void {
    this.rpg.closeCover(() => {
      if (returnFocusToCover && this.isBrowser) this.coverCmp()?.focusTrigger();
    });
  }

  onCoverTriggerClick = () =>
    this.rpg.isDesiredOpen() ? this.closePokedex(true) : this.openPokedex();

  onDevicePointerMove(event: PointerEvent): void {
    const el = this.aparelhoEl()?.nativeElement;
    if (el) this.rpg.onPointerMove(event, el);
  }

  onDeviceClick(event: Event): void {
    if (!this.rpg.isDesiredOpen()) {
      event.stopPropagation();
      this.shortcuts.consumePointerPreserved();
      this.openPokedex();
      return;
    }
    if (this.shortcuts.shouldIgnoreDeviceClick(event.target)) return;
    event.stopPropagation();
    this.closePokedex(true);
  }

  onOpenExistingFromDialog(pokemonName: string): void {
    this.slotsStore.setEditMode(false);
    this.transientBadge.set(null);
    this.onSelectFromVisor(pokemonName);
  }

  onOverwrittenFromDialog = (info: { readonly slotIndex: number; readonly name: string }) =>
    this.flashTransientBadge(
      `Slot ${String(info.slotIndex + 1).padStart(2, '0')} atualizado (${info.name})`,
      'sucesso',
    );

  toggleSlotsConfig = (moveFocusToVisor: boolean) =>
    this.rpg.applySlotsConfigTransition(!this.slotsStore.editMode(), moveFocusToVisor);

  onBlueControl = () =>
    this.rpg.advanceOrClearVisor(
      () => {
        this.slotsStore.setEditMode(false);
        this.transientBadge.set(null);
        this.store.clearResult();
      },
      (moveFocus) => this.toggleSlotsConfig(moveFocus),
    );

  onAControl = () =>
    this.rpg.confirmCurrentSelection((moveFocus) => this.toggleSlotsConfig(moveFocus));

  onSelectFromVisor(pokemonName: string): void {
    this.store.setQuery(pokemonName);
    this.store.loadPokemonDetail(pokemonName);
  }

  flashTransientBadge(label: string, variant: 'sucesso' | 'aviso'): void {
    if (this.transientTimer !== null) clearTimeout(this.transientTimer);
    this.transientBadge.set({ label, variant });
    this.transientTimer = setTimeout(() => {
      this.transientBadge.set(null);
      this.transientTimer = null;
    }, 3200);
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
    if (this.transientTimer !== null) clearTimeout(this.transientTimer);
  }

  private openInitialSearch(query: string): void {
    this.store.setCoverOpen(true);
    this.store.ensureCatalogLoaded();
    this.store.searchOrSelect(query);
  }
}
