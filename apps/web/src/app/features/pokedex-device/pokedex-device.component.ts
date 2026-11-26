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
import { ActivatedRoute, type ParamMap } from '@angular/router';
import { Subscription } from 'rxjs';
import { PvMainHeadingDirective } from '../../shared/directives/main-heading.directive';
import { HolocronStore } from '../holocron/holocron.store';
import { PokedexCoverComponent } from './components/pokedex-cover.component';
import { PokedexSearchPanelComponent } from './components/pokedex-search-panel.component';
import {
  PokedexSlotsGridComponent,
  type SlotFeedbackNotice,
} from './components/pokedex-slots-grid.component';
import { PokedexVisorComponent } from './components/pokedex-visor.component';
import { SlotConfirmDialogComponent } from './components/slot-confirm-dialog.component';
import { PokedexCompareStore } from './services/pokedex-compare.store';
import { PokedexInputShortcutsService } from './services/pokedex-input-shortcuts.service';
import { PokedexRpgNavService } from './services/pokedex-rpg-nav.service';
import { PokedexSlotsStore } from './services/pokedex-slots.store';
import type { PokemonDetailView } from './services/pokedex-view-mapper.util';
import { PokedexVisorDetailStore } from './services/pokedex-visor-detail.store';
import { parsePokedexRouteIntent } from './services/pokedex-visor-format.util';
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
  readonly compareStore = inject(PokedexCompareStore);
  readonly holocronStore = inject(HolocronStore);
  readonly visorDetail = inject(PokedexVisorDetailStore);
  readonly rpg = inject(PokedexRpgNavService);
  private readonly shortcuts = inject(PokedexInputShortcutsService);
  private readonly route = inject(ActivatedRoute);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly aparelhoEl = viewChild<ElementRef<HTMLElement>>('aparelhoEl');
  private readonly searchPanelCmp = viewChild<PokedexSearchPanelComponent>('searchPanelCmp');
  private readonly coverCmp = viewChild<PokedexCoverComponent>('coverCmp');

  readonly isScanning = computed(() => this.store.detailState().status === 'loading');
  readonly transientBadge = signal<SlotFeedbackNotice | null>(null);
  readonly encyCat = signal<string | null>(null);
  readonly encyItem = signal<string | null>(null);
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
    this.applyRouteParams(
      this.route.snapshot.queryParamMap,
      typeof initialData === 'boolean' ? initialData : false,
    );
    this.querySub = this.route.queryParamMap.subscribe((params) =>
      this.applyRouteParams(params, null),
    );
    this.slotsStore.loadSlots();
    this.shortcuts.attach({
      onClose: (rf) => this.closePokedex(rf),
      onStepBack: () => this.searchPanelCmp()?.stepBackOrClearForm(),
      onConfirmA: () => this.onAControl(),
    });
  }

  onDeviceEscape(event: Event): void {
    if (!this.store.coverOpen() || this.shortcuts.isAnyModalOpen()) return;
    event.stopPropagation();
    if (this.visorDetail.collapseIfExpanded()) return;
    this.closePokedex(true);
  }

  openPokedex = () => this.rpg.openCover(() => this.searchPanelCmp()?.focusInput());
  closePokedex = (rf = true) =>
    this.rpg.closeCover(() => {
      if (rf && this.isBrowser) this.coverCmp()?.focusTrigger();
    });
  onCoverTriggerClick = () =>
    this.rpg.isDesiredOpen() ? this.closePokedex(true) : this.openPokedex();
  onDevicePointerMove = (e: PointerEvent) => {
    const el = this.aparelhoEl()?.nativeElement;
    if (el) this.rpg.onPointerMove(e, el);
  };

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
    this.visorDetail.setMode('ficha');
    this.onSelectFromVisor(pokemonName);
  }

  openPokemonInMode(mode: 'holocron' | 'comparar', pokemon: PokemonDetailView): void {
    if (mode === 'holocron') this.holocronStore.openWithPokemon(pokemon);
    else this.compareStore.openWithPokemon(pokemon);
    this.visorDetail.setMode(mode);
  }

  onSendToMode(mode: 'holocron' | 'comparar', pokemonName: string): void {
    this.slotsStore.setEditMode(false);
    const active = this.store.selectedPokemon();
    const isSamePokemon = active?.name.toLowerCase() === pokemonName.toLowerCase();
    if (active && isSamePokemon) {
      this.openPokemonInMode(mode, active);
      return;
    }
    this.store.searchOrSelect(pokemonName);
    if (mode === 'holocron') this.holocronStore.openByIdentifier(pokemonName);
    else this.compareStore.selectSide('left', pokemonName);
    this.visorDetail.setMode(mode);
  }

  toggleSlotsConfig = (moveFocus: boolean) =>
    this.rpg.applySlotsConfigTransition(!this.slotsStore.editMode(), moveFocus);

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

  private applyRouteParams(params: ParamMap, defaultOpen: boolean | null): void {
    const intent = parsePokedexRouteIntent((name) => params.get(name), defaultOpen);
    if (intent.cat || intent.item) {
      this.encyCat.set(intent.cat);
      this.encyItem.set(intent.item);
    }
    if (intent.query || intent.mode || intent.hasDefault) {
      this.store.setCoverOpen(intent.shouldOpen);
      if (intent.shouldOpen) this.store.ensureCatalogLoaded();
    }
    if (intent.query && intent.query !== this.store.lastSearchedTerm()) {
      this.store.searchOrSelect(intent.query);
    }
    if (intent.mode === 'holocron' && intent.query) {
      this.holocronStore.openByIdentifier(intent.query);
    }
    if (intent.mode) this.visorDetail.setMode(intent.mode);
  }
}
