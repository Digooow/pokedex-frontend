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
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { type PokedexSlotRecord, formatPokeApiText } from '@pokeverse/shared';
import { Subscription } from 'rxjs';
import { PokedexCoverComponent } from './components/pokedex-cover.component';
import { PokedexSearchPanelComponent } from './components/pokedex-search-panel.component';
import { PokedexVisorComponent } from './components/pokedex-visor.component';
import { SlotConfirmDialogComponent } from './components/slot-confirm-dialog.component';
import {
  KEY_TO_DIRECTION,
  PokedexRpgNavService,
} from './services/pokedex-rpg-nav.service';
import { PokedexSlotsStore } from './services/pokedex-slots.store';
import { PokedexStore } from './services/pokedex.store';

const SLOT_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Canonical 3D Hinged Pokédex Stage faithfully integrated with PokéVerse cloud telemetry and Neon slots. */
@Component({
  selector: 'pv-pokedex-device',
  imports: [
    PokedexCoverComponent,
    PokedexSearchPanelComponent,
    PokedexVisorComponent,
    SlotConfirmDialogComponent,
  ],
  providers: [PokedexRpgNavService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pokedex-device.component.html',
  styleUrl: './pokedex-device.component.scss',
})
export class PokedexDevicePageComponent implements OnInit, OnDestroy {
  readonly store = inject(PokedexStore);
  readonly slotsStore = inject(PokedexSlotsStore);
  readonly rpg = inject(PokedexRpgNavService);
  private readonly route = inject(ActivatedRoute);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly aparelhoEl = viewChild<ElementRef<HTMLElement>>('aparelhoEl');
  private readonly searchPanelCmp = viewChild<PokedexSearchPanelComponent>('searchPanelCmp');

  readonly slotIndices = SLOT_INDICES;
  readonly isScanning = computed(() => this.store.detailState().status === 'loading');
  readonly transientBadge = signal<{ readonly label: string; readonly variant: 'sucesso' | 'aviso' } | null>(null);

  private transientTimer: ReturnType<typeof setTimeout> | null = null;
  private querySub: Subscription | null = null;

  private readonly onDocPointerDown = (event: Event) => {
    this.rpg.deactivateKeyboardMode();
    this.rpg.markPointerStart(event.target);
  };

  private readonly onDocClick = (event: Event) => {
    const startedPreserved = this.rpg.consumePointerPreserved();
    if (!this.rpg.isDesiredOpen() || this.rpg.isAnyModalOpen()) {
      return;
    }
    const target = event.target;
    if (
      startedPreserved ||
      (target instanceof Node && !target.isConnected) ||
      this.rpg.belongsTo(
        target,
        '.painel-busca, .painel-resultado, .pokedex-controles-fisicos, .pokedex-rodape-direito, .controle-interativo, .barra-cenarios, .hud-topbar, .hud-dock, .rodape, dialog, dialog[open]',
      )
    ) {
      return;
    }
    this.closePokedex(false);
  };

  private readonly onDocKeyDown = (event: KeyboardEvent) => {
    if (!this.store.coverOpen() || this.rpg.isAnyModalOpen()) {
      return;
    }

    if (event.key === 'Escape') {
      this.closePokedex(true);
      return;
    }

    const direction = KEY_TO_DIRECTION[event.key];
    const target = event.target as HTMLElement | null;

    if (this.isEditableControl(target)) {
      this.handleInputKeyDown(event, target, direction);
      return;
    }

    if (direction || event.key === 'Enter' || event.key === 'Backspace' || event.key === 'Tab') {
      this.rpg.activateKeyboardMode();
    }

    this.handleStageKeyDown(event, target, direction);
  };

  onDeviceEscape(event: Event): void {
    if (!this.store.coverOpen() || this.rpg.isAnyModalOpen()) {
      return;
    }
    event.stopPropagation();
    this.closePokedex(true);
  }

  private isEditableControl(target: HTMLElement | null): target is HTMLElement {
    if (!target) {
      return false;
    }
    return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
  }

  private handleInputKeyDown(
    event: KeyboardEvent,
    target: HTMLElement,
    direction: (typeof KEY_TO_DIRECTION)[string] | undefined,
  ): void {
    if (!direction) {
      return;
    }

    if (target.classList.contains('slot-form-input')) {
      if (direction === 'cima' || direction === 'baixo') {
        event.preventDefault();
        this.rpg.navigate(direction);
      }
      return;
    }

    if (target.id !== 'pokemon-input') {
      return;
    }

    if (this.rpg.rpgLevel() === 'telas' && !this.store.query()) {
      event.preventDefault();
      target.blur();
      this.rpg.navigate(direction);
      return;
    }

    if (direction === 'baixo') {
      event.preventDefault();
      target.blur();
      this.rpg.enterScreen('lista');
      return;
    }

    if (direction === 'cima') {
      event.preventDefault();
      target.blur();
      this.rpg.rpgLevel.set('telas');
      this.rpg.rpgScreen.set('busca');
      this.rpg.syncFocusVisuals(false);
    }
  }

  private handleStageKeyDown(
    event: KeyboardEvent,
    target: HTMLElement | null,
    direction: (typeof KEY_TO_DIRECTION)[string] | undefined,
  ): void {
    if (direction) {
      event.preventDefault();
      this.rpg.navigate(direction);
      return;
    }

    const isNativeFocusable =
      target?.tagName === 'BUTTON' || target?.tagName === 'A' || Boolean(target?.closest('a[href]'));
    if (event.key === 'Enter' && !isNativeFocusable) {
      event.preventDefault();
      this.onAControl();
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      this.rpg.goBackOrClearForm(() => this.searchPanelCmp()?.clearForm());
    }
  }

  constructor() {
    effect(() => {
      const selected = this.store.selectedPokemon();
      if (selected) {
        this.transientBadge.set(null);
        this.rpg.syncCatalogSelection(selected.name);
      }
    });

    effect(() => {
      const el = this.aparelhoEl()?.nativeElement;
      if (el) {
        this.rpg.attachHost(el);
      }
    });
  }

  ngOnInit(): void {
    const initialData = this.route.snapshot.data['initialCoverOpen'];
    const initialQuery = this.route.snapshot.queryParamMap.get('q')?.trim() ?? '';

    if (initialQuery) {
      this.store.setCoverOpen(true);
      this.store.ensureCatalogLoaded();
      this.store.searchOrSelect(initialQuery);
    } else if (typeof initialData === 'boolean') {
      this.store.setCoverOpen(initialData);
      if (initialData) {
        this.store.ensureCatalogLoaded();
      }
    } else {
      this.store.setCoverOpen(false);
    }

    this.querySub = this.route.queryParamMap.subscribe((params) => {
      const q = params.get('q')?.trim();
      if (q && q !== this.store.lastSearchedTerm()) {
        this.store.setCoverOpen(true);
        this.store.ensureCatalogLoaded();
        this.store.searchOrSelect(q);
      }
    });

    this.slotsStore.loadSlots();

    if (this.isBrowser) {
      document.addEventListener('pointerdown', this.onDocPointerDown);
      document.addEventListener('mousedown', this.onDocPointerDown);
      document.addEventListener('click', this.onDocClick);
      document.addEventListener('keydown', this.onDocKeyDown);
    }
  }

  openPokedex(): void {
    this.rpg.openCover(() => {
      this.searchPanelCmp()?.focusInput();
    });
  }

  closePokedex(returnFocusToCover = true): void {
    this.rpg.closeCover(() => {
      if (returnFocusToCover && this.isBrowser) {
        document.getElementById('btn-abrir-pokedex')?.focus();
      }
    });
  }

  onCoverTriggerClick(): void {
    if (this.rpg.isDesiredOpen()) {
      this.closePokedex(true);
    } else {
      this.openPokedex();
    }
  }

  onDevicePointerMove(event: PointerEvent): void {
    const el = this.aparelhoEl()?.nativeElement;
    if (el) {
      this.rpg.onPointerMove(event, el);
    }
  }

  onDeviceClick(event: Event): void {
    if (!this.rpg.isDesiredOpen()) {
      event.stopPropagation();
      this.rpg.consumePointerPreserved();
      this.openPokedex();
      return;
    }

    const target = event.target;
    const startedPreserved = this.rpg.consumePointerPreserved();
    if (
      startedPreserved ||
      (target instanceof Node && !target.isConnected) ||
      (!this.rpg.isAnimating() && this.rpg.isInternalInteractiveTarget(target)) ||
      (!this.rpg.isAnimating() && this.rpg.belongsTo(target, '#tampa-frente'))
    ) {
      return;
    }
    event.stopPropagation();
    this.closePokedex(true);
  }

  getSlot(slotIndex: number): PokedexSlotRecord | null {
    return this.slotsStore.slotsMap().get(slotIndex) ?? null;
  }

  isSlotActivePokemon(slotIndex: number): boolean {
    const slot = this.getSlot(slotIndex);
    const active = this.store.selectedPokemon();
    if (!slot || !active) {
      return false;
    }
    return slot.pokemonName.toLowerCase() === active.name.toLowerCase();
  }

  isSlotRpgFocused(index: number): boolean {
    return (
      this.rpg.keyboardRpgActive() &&
      this.store.coverOpen() &&
      this.rpg.rpgLevel() === 'itens' &&
      this.rpg.rpgScreen() === 'slots' &&
      this.rpg.rpgSlotFocusIndex() === index
    );
  }

  slotAriaLabel(slotIndex: number): string {
    const num = String(slotIndex + 1).padStart(2, '0');
    const slot = this.getSlot(slotIndex);
    if (!slot) {
      return `Slot ${num} livre. Clique para gravar o Pokémon exibido.`;
    }
    const label = slot.nickname
      ? `${slot.nickname} (${formatPokeApiText(slot.pokemonName)})`
      : formatPokeApiText(slot.pokemonName);
    return `Slot ${num} utilizado: ${label}. Clique para exibir.`;
  }

  slotTitle(slotIndex: number): string {
    const num = String(slotIndex + 1).padStart(2, '0');
    const slot = this.getSlot(slotIndex);
    if (!slot) {
      return `Slot ${num} (livre) — clique para gravar o Pokémon exibido`;
    }
    const label = slot.nickname
      ? `${slot.nickname} (${formatPokeApiText(slot.pokemonName)})`
      : formatPokeApiText(slot.pokemonName);
    return `Slot ${num} (utilizado): ${label} — clique para abrir`;
  }

  onSlotClick(slotIndex: number, event: Event): void {
    event.stopPropagation();
    this.rpg.deactivateKeyboardMode();
    (event.currentTarget as HTMLElement | null)?.blur?.();
    this.rpg.rpgLevel.set('itens');
    this.rpg.rpgScreen.set('slots');
    this.rpg.rpgSlotFocusIndex.set(slotIndex);

    const existing = this.getSlot(slotIndex);
    const active = this.store.selectedPokemon();

    if (existing) {
      if (!active || active.name.toLowerCase() === existing.pokemonName.toLowerCase()) {
        this.onOpenExistingFromDialog(existing.pokemonName);
        return;
      }

      const duplicateSlot = this.slotsStore.findSlotByPokemon(active.id, active.name, slotIndex);
      this.slotsStore.requestConfirm({
        kind: 'overwrite-click',
        slotIndex,
        existingLabel: formatPokeApiText(existing.pokemonName),
        existingName: existing.pokemonName,
        candidate: active,
        duplicateSlotIndex: duplicateSlot,
      });
      return;
    }

    if (active) {
      const duplicateSlot = this.slotsStore.findSlotByPokemon(active.id, active.name, slotIndex);
      if (duplicateSlot !== null) {
        this.slotsStore.saveSlot(slotIndex, active);
        this.flashTransientBadge(
          `Já salvo no slot ${String(duplicateSlot + 1).padStart(2, '0')}`,
          'aviso',
        );
        return;
      }
      if (this.slotsStore.saveSlot(slotIndex, active)) {
        this.flashTransientBadge(`Salvo no slot ${String(slotIndex + 1).padStart(2, '0')}`, 'sucesso');
      }
      return;
    }

    this.flashTransientBadge('Busque p/ gravar', 'aviso');
  }

  onOpenExistingFromDialog(pokemonName: string): void {
    this.slotsStore.setEditMode(false);
    this.transientBadge.set(null);
    this.store.setQuery(pokemonName);
    this.store.loadPokemonDetail(pokemonName);
  }

  onOverwrittenFromDialog(info: { readonly slotIndex: number; readonly name: string }): void {
    this.flashTransientBadge(
      `Slot ${String(info.slotIndex + 1).padStart(2, '0')} atualizado (${info.name})`,
      'sucesso',
    );
  }

  toggleSlotsConfig(moveFocusToVisor: boolean, event?: Event): void {
    event?.stopPropagation();
    if (!moveFocusToVisor && event) {
      this.rpg.deactivateKeyboardMode();
      (event.currentTarget as HTMLElement | null)?.blur?.();
    }
    const opening = !this.slotsStore.editMode();
    if (opening) {
      this.slotsStore.setEditMode(true);
      this.rpg.rpgScreen.set('visor');
      this.rpg.rpgLevel.set('itens');
      this.rpg.rpgControlIndices.update((prev) => ({ ...prev, visor: 0 }));
      if (moveFocusToVisor) {
        setTimeout(() => this.rpg.syncFocusVisuals(true), 0);
      }
    } else {
      this.slotsStore.setEditMode(false);
      this.rpg.rpgScreen.set('slots');
      this.rpg.rpgLevel.set('itens');
      this.rpg.rpgSlotFocusIndex.set(10);
      if (moveFocusToVisor) {
        setTimeout(() => this.rpg.syncFocusVisuals(true), 0);
      }
    }
  }

  onBlueControl(): void {
    this.rpg.advanceOrClearVisor(
      () => {
        this.slotsStore.setEditMode(false);
        this.transientBadge.set(null);
        this.store.clearResult();
      },
      (moveFocus) => this.toggleSlotsConfig(moveFocus),
    );
  }

  onAControl(): void {
    this.rpg.confirmCurrentSelection((moveFocus) => this.toggleSlotsConfig(moveFocus));
  }

  onSelectFromVisor(pokemonName: string): void {
    this.store.setQuery(pokemonName);
    this.store.loadPokemonDetail(pokemonName);
  }

  private flashTransientBadge(label: string, variant: 'sucesso' | 'aviso'): void {
    if (this.transientTimer !== null) {
      clearTimeout(this.transientTimer);
    }
    this.transientBadge.set({ label, variant });
    this.transientTimer = setTimeout(() => {
      this.transientBadge.set(null);
      this.transientTimer = null;
    }, 3200);
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
    if (this.transientTimer !== null) {
      clearTimeout(this.transientTimer);
    }
    if (this.isBrowser) {
      document.removeEventListener('pointerdown', this.onDocPointerDown);
      document.removeEventListener('mousedown', this.onDocPointerDown);
      document.removeEventListener('click', this.onDocClick);
      document.removeEventListener('keydown', this.onDocKeyDown);
    }
  }
}
