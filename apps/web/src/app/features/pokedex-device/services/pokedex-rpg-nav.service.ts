import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { QualityStore } from '../../../core/stores/quality.store';
import { PokedexRpgFocusRegistry, type RpgFocusGroup } from '../directives/rpg-focusable.directive';
import { PokedexLidPhysicsService } from './pokedex-lid-physics.service';
import * as rpgNav from './pokedex-rpg-nav.util';
import type { RpgDirection, RpgLevel, RpgScreen } from './pokedex-rpg-nav.util';
import { PokedexSlotsStore } from './pokedex-slots.store';
import { PokedexVisorDetailStore } from './pokedex-visor-detail.store';
import { PokedexStore } from './pokedex.store';

export {
  KEY_TO_DIRECTION,
  type RpgDirection,
  type RpgLevel,
  type RpgScreen,
} from './pokedex-rpg-nav.util';

@Injectable()
export class PokedexRpgNavService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly quality = inject(QualityStore);
  private readonly pokedex = inject(PokedexStore);
  private readonly slotsStore = inject(PokedexSlotsStore);
  private readonly visorDetail = inject(PokedexVisorDetailStore);
  private readonly lidPhysics = inject(PokedexLidPhysicsService);
  private readonly focusRegistry = inject(PokedexRpgFocusRegistry);
  private hostEl: HTMLElement | null = null;

  readonly isAnimating = this.lidPhysics.isAnimating;
  readonly isTransitioning = this.lidPhysics.isTransitioning;
  readonly luzActive = this.lidPhysics.luzActive;
  readonly luzX = this.lidPhysics.luzX;
  readonly luzY = this.lidPhysics.luzY;

  readonly keyboardRpgActive = signal(false);
  readonly rpgLevel = signal<RpgLevel>('telas');
  readonly rpgScreen = signal<RpgScreen>('busca');
  readonly rpgCatalogIndex = signal(0);
  readonly rpgSlotFocusIndex = signal(0);
  readonly rpgControlIndices = signal<Record<'busca' | 'visor' | 'edicao', number>>({
    ...rpgNav.INITIAL_RPG_CONTROL_INDICES,
  });

  readonly isVisorSelectingList = computed(() =>
    rpgNav.isRpgVisorSelectingList(this.navSnapshot()),
  );
  readonly redButtonTooltip = computed(() =>
    rpgNav.resolveRedButtonTooltip(
      this.slotsStore.editMode(),
      this.pokedex.previousQuery(),
      this.pokedex.query(),
    ),
  );
  readonly blueButtonTooltip = computed(() =>
    rpgNav.resolveBlueButtonTooltip(this.willBlueButtonEnterSubmenu()),
  );

  attachHost(element: HTMLElement): void {
    this.hostEl = element;
    this.lidPhysics.attachHost(element);
  }

  onPointerMove = (event: PointerEvent, deviceEl: HTMLElement) =>
    this.lidPhysics.onPointerMove(event, deviceEl);
  resetGlint = () => this.lidPhysics.resetGlint();
  isDesiredOpen = () => this.lidPhysics.isDesiredOpen();
  activateKeyboardMode = () => this.keyboardRpgActive.set(true);
  openCover = (onComplete?: () => void) => this.toggleCover(true, onComplete);
  closeCover = (onComplete?: () => void) => this.toggleCover(false, onComplete);

  deactivateKeyboardMode(): void {
    if (this.keyboardRpgActive()) this.keyboardRpgActive.set(false);
    this.focusRegistry.clearFocusVisuals();
  }

  isScreenHighlighted(screen: RpgScreen): boolean {
    const controlsCount = this.collectScreenControls(screen).length;
    return rpgNav.isRpgScreenHighlighted(this.navSnapshot(), screen, controlsCount);
  }

  setScreenFocus(screen: RpgScreen, level: RpgLevel = 'itens', controlIdx = 0): void {
    if (this.rpgLevel() === 'edicao' && level !== 'edicao') return;
    if (screen === 'busca' || screen === 'visor') this.setControlIndex(screen, controlIdx);
    this.applyNavState(level, screen);
  }

  onSearchInputEdited(): void {
    this.rpgCatalogIndex.set(0);
    this.setControlIndex('busca', 0);
    this.pokedex.ensureCatalogLoaded();
    this.applyNavState('itens', 'busca');
  }

  applySlotsConfigTransition(opening: boolean, moveFocusToVisor: boolean): void {
    const plan = rpgNav.resolveSlotsConfigTransitionPlan(opening);
    this.slotsStore.setEditMode(opening);
    this.rpgLevel.set('itens');
    this.rpgScreen.set(plan.screen);
    if (plan.visorIndex !== null) this.setControlIndex('visor', plan.visorIndex);
    if (plan.slotFocusIndex !== null) this.rpgSlotFocusIndex.set(plan.slotFocusIndex);
    if (moveFocusToVisor) this.focusRegistry.afterTick(() => this.syncFocusVisuals(true));
  }

  navigate(direction: RpgDirection): void {
    if (!this.pokedex.coverOpen()) return;
    const isDesktop = !this.isBrowser || window.innerWidth >= rpgNav.DESKTOP_MIN_WIDTH_PX;
    const controlsCount = this.collectScreenControls(this.activeFocusGroup()).length;
    const hasVisorTabs = !this.slotsStore.editMode() && this.pokedex.selectedPokemon() !== null;
    const action = rpgNav.resolveRpgNavigationAction(
      this.rpgLevel(),
      this.rpgScreen(),
      direction,
      isDesktop,
      this.rpgSlotFocusIndex(),
      controlsCount,
      hasVisorTabs,
    );
    if (action.kind === 'screen') {
      if (action.nextScreen) this.rpgScreen.set(action.nextScreen);
      return this.syncFocusVisuals(false);
    }
    if (action.kind === 'catalog') return this.moveCatalogCursor(action.offset);
    if (action.kind === 'visor-tab') {
      this.visorDetail.stepTab(action.step, this.pokedex.selectedPokemon()?.name ?? null);
      this.setControlIndex('visor', 0);
      return this.focusRegistry.scrollGroupToTopAfterTick('visor');
    }
    if (action.kind === 'visor-scroll') {
      if (action.deltaY !== 0) this.focusRegistry.scrollGroupBy('visor', action.deltaY);
      return;
    }
    if (action.kind === 'slot') this.rpgSlotFocusIndex.set(action.nextSlotIndex);
    else {
      const idx = this.rpgControlIndices()[action.key] ?? 0;
      this.setControlIndex(action.key, rpgNav.clampIndexInRange(idx, action.step, controlsCount));
    }
    this.syncFocusVisuals(true);
  }

  enterScreen(screen: RpgScreen): void {
    if (screen === 'lista') this.pokedex.ensureCatalogLoaded();
    this.applyNavState('itens', screen, true);
  }

  goBackOrClearForm(onStepBack: () => void, forceStepBack = false): void {
    if (this.rpgLevel() === 'edicao') {
      this.slotsStore.setEditingSlotIndex(null);
      this.applyNavState('itens', 'visor', this.keyboardRpgActive());
      return;
    }
    if (this.slotsStore.editMode()) {
      this.slotsStore.setEditMode(false);
      this.applyNavState('telas', this.rpgScreen(), this.keyboardRpgActive());
      return;
    }
    if (rpgNav.shouldStepBackToScreensLevel(forceStepBack, this.navSnapshot())) {
      this.focusRegistry.blurActiveInput();
      this.applyNavState('telas', this.rpgScreen());
      return;
    }
    onStepBack();
    this.syncFocusVisuals(false);
  }

  advanceOrClearVisor(
    onClearVisor: () => void,
    onToggleConfig: (moveFocus: boolean) => void,
  ): void {
    if (this.rpgLevel() === 'telas') return this.enterScreen(this.rpgScreen());
    if (this.willBlueButtonEnterSubmenu()) return this.confirmCurrentSelection(onToggleConfig);
    onClearVisor();
    this.syncFocusVisuals(false);
  }

  confirmCurrentSelection(onToggleConfig: (moveFocus: boolean) => void): void {
    if (this.rpgLevel() === 'telas') return this.enterScreen(this.rpgScreen());
    if (this.rpgLevel() === 'itens' && this.rpgScreen() === 'lista') {
      const picked = this.pokedex.filteredCatalog().items[this.rpgCatalogIndex()];
      if (picked) this.pokedex.selectFromCatalog(picked.name);
      return;
    }
    const { controls, target } = this.resolveCurrentControl(false);
    if (!target) return;
    if (this.rpgLevel() === 'edicao' && target !== controls[3]) {
      return this.focusRegistry.submitEditForm();
    }
    if (target.id === 'btn-config-slots') return onToggleConfig(true);
    target.click();
  }

  syncFocusVisuals(moveDomFocus: boolean): void {
    this.focusRegistry.clearFocusVisuals();
    if (!this.isBrowser || !this.hostEl) return;
    if (!rpgNav.canSyncRpgFocusVisuals(this.navSnapshot())) return;
    const reduced = this.quality.reducedMotion();
    this.focusRegistry.applyFocusVisuals(this.resolveFocusedElement(), moveDomFocus, reduced);
  }

  syncCatalogSelection(pokemonName: string): void {
    const idx = rpgNav.findCatalogIndexByName(this.pokedex.filteredCatalog().items, pokemonName);
    if (idx < 0) return;
    this.rpgCatalogIndex.set(idx);
    this.pokedex.ensureCatalogIndexVisible(idx);
  }

  setCatalogCursor(index: number): void {
    this.rpgCatalogIndex.set(Math.max(0, index));
    this.applyNavState('itens', 'lista');
  }

  scrollCatalogIndexIntoView(index: number): void {
    const safeIndex = Math.max(0, index);
    this.setCatalogCursor(safeIndex);
    this.focusRegistry.scrollItemIntoViewAfterTick(
      this.hostEl,
      'lista',
      safeIndex,
      this.quality.reducedMotion(),
    );
  }

  scrollCatalogToTop(): void {
    this.rpgCatalogIndex.set(0);
    this.focusRegistry.scrollGroupToTopAfterTick('lista');
  }

  private toggleCover(open: boolean, onComplete?: () => void): void {
    if (this.lidPhysics.isDesiredOpen() === open) return;
    if (open) {
      this.pokedex.ensureCatalogLoaded();
      this.rpgLevel.set('telas');
      this.rpgScreen.set('busca');
    }
    this.lidPhysics.runLidTransition(open, () => {
      this.syncFocusVisuals(false);
      onComplete?.();
    });
  }

  private applyNavState(level: RpgLevel, screen: RpgScreen, moveFocus = false): void {
    this.rpgLevel.set(level);
    this.rpgScreen.set(screen);
    this.syncFocusVisuals(moveFocus);
  }

  private resolveFocusedElement(): HTMLElement | null {
    if (this.rpgScreen() === 'lista')
      return this.collectScreenControls('lista')[this.rpgCatalogIndex()] ?? null;
    if (this.rpgScreen() === 'slots')
      return this.collectScreenControls('slots')[this.rpgSlotFocusIndex()] ?? null;
    return this.resolveCurrentControl(true).target;
  }

  private navSnapshot(): rpgNav.RpgNavSnapshot {
    return {
      keyboardActive: this.keyboardRpgActive(),
      coverOpen: this.pokedex.coverOpen(),
      level: this.rpgLevel(),
      screen: this.rpgScreen(),
      query: this.pokedex.query(),
      catalogIndex: this.rpgCatalogIndex(),
      slotFocusIndex: this.rpgSlotFocusIndex(),
    };
  }

  private resolveCurrentControl(clamp: boolean) {
    const group = this.activeFocusGroup();
    if (group === 'slots') {
      return this.focusRegistry.resolveGroupTarget(
        this.hostEl,
        'slots',
        this.rpgSlotFocusIndex(),
        false,
      );
    }
    const key = rpgNav.resolveControlGroupKey(this.rpgLevel(), this.rpgScreen());
    const rawIdx = this.rpgControlIndices()[key] ?? 0;
    const resolved = this.focusRegistry.resolveGroupTarget(this.hostEl, group, rawIdx, clamp);
    if (clamp && resolved.index !== rawIdx) this.setControlIndex(key, resolved.index);
    return resolved;
  }

  private moveCatalogCursor(offset: number): void {
    this.pokedex.ensureCatalogLoaded();
    const { status } = this.pokedex.catalogState();
    const filteredLen = this.pokedex.filteredCatalog().items.length;
    const total = this.pokedex.catalogTotalCount();
    const nextIdx = rpgNav.resolveCatalogCursorTarget(
      status,
      filteredLen,
      total,
      this.pokedex.query(),
      this.rpgCatalogIndex(),
      offset,
    );
    if (nextIdx === null) return;
    this.rpgCatalogIndex.set(nextIdx);
    this.pokedex.ensureCatalogIndexVisible(nextIdx);
    this.focusRegistry.afterTick(() => this.syncFocusVisuals(true));
  }

  private readonly activeFocusGroup = (): RpgFocusGroup =>
    rpgNav.resolveFocusGroup(this.rpgLevel(), this.rpgScreen());
  private readonly collectScreenControls = (group: RpgFocusGroup) =>
    this.focusRegistry.collectGroupControls(this.hostEl, group);
  private readonly setControlIndex = (key: 'busca' | 'visor' | 'edicao', value: number) =>
    this.rpgControlIndices.update((prev) => ({ ...prev, [key]: value }));
  private readonly willBlueButtonEnterSubmenu = () =>
    rpgNav.shouldBlueButtonEnterFromVisor(
      this.navSnapshot(),
      this.focusRegistry.resolveGroupControlAction(
        this.hostEl,
        'visor',
        this.rpgControlIndices().visor,
      ),
    );
}
