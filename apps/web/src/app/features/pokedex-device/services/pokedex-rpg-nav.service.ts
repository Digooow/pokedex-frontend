import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { QualityStore } from '../../../core/stores/quality.store';
import {
  PokedexRpgFocusRegistry,
  type RpgFocusGroup,
} from '../directives/rpg-focusable.directive';
import { PokedexLidPhysicsService } from './pokedex-lid-physics.service';
import { PokedexSlotsStore } from './pokedex-slots.store';
import { PokedexStore } from './pokedex.store';

export type RpgLevel = 'telas' | 'itens' | 'edicao';
export type RpgScreen = 'busca' | 'lista' | 'visor' | 'slots';
export type RpgDirection = 'cima' | 'baixo' | 'esquerda' | 'direita';

const DESKTOP_MIN_WIDTH_PX = 880;
const TOTAL_SLOTS_AZUIS = 10;
const MOBILE_SCREEN_ORDER: readonly RpgScreen[] = ['busca', 'lista', 'visor', 'slots'];

const DESKTOP_SCREEN_MAP: Record<RpgScreen, Partial<Record<RpgDirection, RpgScreen>>> = {
  busca: { direita: 'visor', baixo: 'lista' },
  lista: { cima: 'busca', direita: 'slots' },
  visor: { esquerda: 'busca', baixo: 'slots' },
  slots: { cima: 'visor', esquerda: 'lista' },
};

const LIST_STEP_BY_DIR: Record<RpgDirection, number> = {
  cima: -1,
  baixo: 1,
  esquerda: -5,
  direita: 5,
};

export const KEY_TO_DIRECTION: Readonly<Record<string, RpgDirection>> = {
  ArrowUp: 'cima',
  ArrowDown: 'baixo',
  ArrowLeft: 'esquerda',
  ArrowRight: 'direita',
};

const PRESERVED_OUTSIDE_SELECTOR =
  '.painel-busca, .painel-resultado, .pokedex-controles-fisicos, .pokedex-rodape-direito, .controle-interativo, .barra-cenarios, .hud-topbar, .hud-dock, .rodape, dialog, dialog[open]';
const INTERNAL_INTERACTIVE_SELECTOR =
  '.painel-busca, .painel-resultado, .pokedex-controles-fisicos, .pokedex-rodape-direito, .controle-interativo';

function nextSlotIndexForDirection(current: number, direction: RpgDirection): number {
  if (direction === 'esquerda') return Math.max(0, current - 1);
  if (direction === 'direita') return Math.min(TOTAL_SLOTS_AZUIS, current + 1);
  if (direction === 'baixo') return Math.min(TOTAL_SLOTS_AZUIS, current + 5);
  if (current >= TOTAL_SLOTS_AZUIS) return 5;
  return current < 5 ? current : current - 5;
}

@Injectable()
export class PokedexRpgNavService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly quality = inject(QualityStore);
  private readonly pokedex = inject(PokedexStore);
  private readonly slotsStore = inject(PokedexSlotsStore);
  private readonly lidPhysics = inject(PokedexLidPhysicsService);
  private readonly focusRegistry = inject(PokedexRpgFocusRegistry);

  private hostEl: HTMLElement | null = null;
  private pointerStartedPreserved = false;

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
    busca: 0,
    visor: 0,
    edicao: 0,
  });

  readonly isVisorSelectingList = computed(
    () =>
      this.keyboardRpgActive() &&
      this.pokedex.coverOpen() &&
      this.rpgLevel() === 'itens' &&
      this.rpgScreen() === 'lista',
  );

  readonly redButtonTooltip = computed(() => {
    if (this.slotsStore.editMode()) return 'Botão vermelho: sair da edição de slots';
    const previousQuery = this.pokedex.previousQuery();
    if (previousQuery) return `Botão vermelho: voltar para "${previousQuery}"`;
    if (this.pokedex.query().trim()) return 'Botão vermelho: voltar para todos os Pokémon';
    return 'Botão vermelho: voltar ao início da lista';
  });

  readonly blueButtonTooltip = computed(() =>
    this.willBlueButtonEnterSubmenu()
      ? 'Botão azul: entrar no menu destacado'
      : 'Botão azul: limpar visor de resultados',
  );

  attachHost(element: HTMLElement): void {
    this.hostEl = element;
    this.lidPhysics.attachHost(element);
  }

  markPointerStart = (target: EventTarget | null) => {
    this.pointerStartedPreserved = this.belongsTo(target, PRESERVED_OUTSIDE_SELECTOR);
  };

  consumePointerPreserved(): boolean {
    const startedPreserved = this.pointerStartedPreserved;
    this.pointerStartedPreserved = false;
    return startedPreserved;
  }

  belongsTo = (target: EventTarget | null, selector: string) =>
    target instanceof Element && Boolean(target.closest(selector));

  isInternalInteractiveTarget = (target: EventTarget | null) =>
    this.belongsTo(target, INTERNAL_INTERACTIVE_SELECTOR);

  isAnyModalOpen = () => this.focusRegistry.hasOpenModalDialog();
  onPointerMove = (event: PointerEvent, deviceEl: HTMLElement) =>
    this.lidPhysics.onPointerMove(event, deviceEl);
  resetGlint = () => this.lidPhysics.resetGlint();
  isDesiredOpen = () => this.lidPhysics.isDesiredOpen();
  activateKeyboardMode = () => this.keyboardRpgActive.set(true);

  openCover(onComplete?: () => void): void {
    if (this.lidPhysics.isDesiredOpen()) return;
    this.pokedex.ensureCatalogLoaded();
    this.rpgLevel.set('telas');
    this.rpgScreen.set('busca');
    this.lidPhysics.runLidTransition(true, () => {
      this.syncFocusVisuals(false);
      onComplete?.();
    });
  }

  closeCover(onComplete?: () => void): void {
    if (!this.lidPhysics.isDesiredOpen()) return;
    this.lidPhysics.runLidTransition(false, () => {
      this.syncFocusVisuals(false);
      onComplete?.();
    });
  }

  deactivateKeyboardMode(): void {
    if (this.keyboardRpgActive()) this.keyboardRpgActive.set(false);
    this.focusRegistry.clearFocusVisuals(this.hostEl);
  }

  isScreenHighlighted(screen: RpgScreen): boolean {
    if (!this.keyboardRpgActive() || !this.pokedex.coverOpen()) return false;
    if (this.rpgLevel() === 'telas') return this.rpgScreen() === screen;
    return this.collectScreenControls(screen).length === 0 && this.rpgScreen() === screen;
  }

  setScreenFocus(screen: RpgScreen, level: RpgLevel = 'itens', controlIdx = 0): void {
    if (this.rpgLevel() === 'edicao' && level !== 'edicao') return;
    this.rpgScreen.set(screen);
    this.rpgLevel.set(level);
    if (screen === 'busca' || screen === 'visor') this.setControlIndex(screen, controlIdx);
    this.syncFocusVisuals(false);
  }

  navigate(direction: RpgDirection): void {
    if (!this.pokedex.coverOpen()) return;
    if (this.rpgLevel() === 'telas') {
      this.navigateScreens(direction);
      return;
    }
    if (this.rpgLevel() === 'itens' && this.rpgScreen() === 'lista') {
      this.moveCatalogCursor(LIST_STEP_BY_DIR[direction]);
      return;
    }
    if (this.rpgLevel() === 'itens' && this.rpgScreen() === 'slots') {
      this.rpgSlotFocusIndex.set(nextSlotIndexForDirection(this.rpgSlotFocusIndex(), direction));
      this.syncFocusVisuals(true);
      return;
    }

    const controls = this.collectCurrentControls();
    if (this.rpgLevel() === 'itens' && this.rpgScreen() === 'visor' && controls.length === 0) {
      const delta = direction === 'baixo' ? 72 : direction === 'cima' ? -72 : 0;
      if (delta !== 0) this.focusRegistry.scrollGroupBy(this.hostEl, 'visor', delta);
      return;
    }

    const key = this.rpgLevel() === 'edicao' ? 'edicao' : (this.rpgScreen() as 'busca' | 'visor');
    const step = direction === 'cima' || direction === 'esquerda' ? -1 : 1;
    const maxIdx = Math.max(0, controls.length - 1);
    this.setControlIndex(key, Math.max(0, Math.min(maxIdx, (this.rpgControlIndices()[key] ?? 0) + step)));
    this.syncFocusVisuals(true);
  }

  enterScreen(screen: RpgScreen): void {
    this.rpgScreen.set(screen);
    this.rpgLevel.set('itens');
    if (screen === 'lista') this.pokedex.ensureCatalogLoaded();
    this.syncFocusVisuals(true);
  }

  goBackOrClearForm(onStepBack: () => void, forceStepBack = false): void {
    if (this.rpgLevel() === 'edicao') {
      this.slotsStore.setEditingSlotIndex(null);
      this.rpgLevel.set('itens');
      this.rpgScreen.set('visor');
      this.syncFocusVisuals(this.keyboardRpgActive());
      return;
    }
    if (this.slotsStore.editMode()) {
      this.slotsStore.setEditMode(false);
      this.rpgLevel.set('telas');
      this.syncFocusVisuals(this.keyboardRpgActive());
      return;
    }
    if (!forceStepBack && this.keyboardRpgActive() && this.rpgLevel() === 'itens' && !this.pokedex.query().trim() && this.rpgCatalogIndex() === 0) {
      this.focusRegistry.blurActiveInput();
      this.rpgLevel.set('telas');
      this.syncFocusVisuals(false);
      return;
    }
    onStepBack();
    this.syncFocusVisuals(false);
  }

  advanceOrClearVisor(onClearVisor: () => void, onToggleConfig: (moveFocus: boolean) => void): void {
    if (this.rpgLevel() === 'telas') {
      this.enterScreen(this.rpgScreen());
      return;
    }
    if (this.willBlueButtonEnterSubmenu()) {
      this.confirmCurrentSelection(onToggleConfig);
      return;
    }
    onClearVisor();
    this.syncFocusVisuals(false);
  }

  confirmCurrentSelection(onToggleConfig: (moveFocus: boolean) => void): void {
    if (this.rpgLevel() === 'telas') {
      this.enterScreen(this.rpgScreen());
      return;
    }
    if (this.rpgLevel() === 'itens' && this.rpgScreen() === 'lista') {
      const picked = this.pokedex.filteredCatalog().items[this.rpgCatalogIndex()];
      if (picked) this.pokedex.selectFromCatalog(picked.name);
      return;
    }

    const controls = this.collectCurrentControls();
    const key = this.rpgLevel() === 'edicao' ? 'edicao' : (this.rpgScreen() as 'busca' | 'visor' | 'slots');
    const idx = key === 'slots' ? this.rpgSlotFocusIndex() : (this.rpgControlIndices()[key] ?? 0);
    const target = controls[idx];
    if (!target) return;

    if (this.rpgLevel() === 'edicao' && target !== controls[3]) {
      this.focusRegistry.submitEditForm(this.hostEl);
      return;
    }
    if (target.id === 'btn-config-slots') {
      onToggleConfig(true);
      return;
    }
    target.click();
  }

  syncFocusVisuals(moveDomFocus: boolean): void {
    this.focusRegistry.clearFocusVisuals(this.hostEl);
    if (!this.isBrowser || !this.hostEl || !this.keyboardRpgActive() || !this.pokedex.coverOpen() || this.rpgLevel() === 'telas') {
      return;
    }
    this.focusRegistry.applyFocusVisuals(this.resolveFocusedElement(), moveDomFocus, this.quality.reducedMotion());
  }

  syncCatalogSelection(pokemonName: string): void {
    const idx = this.pokedex.filteredCatalog().items.findIndex((entry) => entry.name === pokemonName.toLowerCase());
    if (idx >= 0) {
      this.rpgCatalogIndex.set(idx);
      this.pokedex.ensureCatalogIndexVisible(idx);
    }
  }

  setCatalogCursor(index: number): void {
    this.rpgCatalogIndex.set(Math.max(0, index));
    this.rpgScreen.set('lista');
    this.rpgLevel.set('itens');
    this.syncFocusVisuals(false);
  }

  scrollCatalogIndexIntoView(index: number): void {
    const safeIndex = Math.max(0, index);
    this.setCatalogCursor(safeIndex);
    if (!this.isBrowser) return;
    setTimeout(() => {
      this.focusRegistry.scrollItemIntoView(this.collectScreenControls('lista')[safeIndex], this.quality.reducedMotion());
    }, 0);
  }

  scrollCatalogToTop(): void {
    this.rpgCatalogIndex.set(0);
    if (!this.isBrowser) return;
    setTimeout(() => this.focusRegistry.scrollGroupToTop(this.hostEl, 'lista'), 0);
  }

  private resolveFocusedElement(): HTMLElement | null {
    if (this.rpgScreen() === 'lista') return this.collectScreenControls('lista')[this.rpgCatalogIndex()] ?? null;
    if (this.rpgScreen() === 'slots') return this.collectScreenControls('slots')[this.rpgSlotFocusIndex()] ?? null;
    const key = this.rpgLevel() === 'edicao' ? 'edicao' : (this.rpgScreen() as 'busca' | 'visor');
    const controls = this.collectCurrentControls();
    const idx = Math.max(0, Math.min(controls.length - 1, this.rpgControlIndices()[key] ?? 0));
    if (idx !== this.rpgControlIndices()[key]) this.setControlIndex(key, idx);
    return controls[idx] ?? null;
  }

  private navigateScreens(direction: RpgDirection): void {
    const desktop = !this.isBrowser || window.innerWidth >= DESKTOP_MIN_WIDTH_PX;
    if (desktop) {
      const next = DESKTOP_SCREEN_MAP[this.rpgScreen()]?.[direction];
      if (next) this.rpgScreen.set(next);
    } else {
      const step = direction === 'cima' || direction === 'esquerda' ? -1 : 1;
      const idx = MOBILE_SCREEN_ORDER.indexOf(this.rpgScreen());
      const targetScreen = MOBILE_SCREEN_ORDER[Math.max(0, Math.min(MOBILE_SCREEN_ORDER.length - 1, idx + step))];
      if (targetScreen) this.rpgScreen.set(targetScreen);
    }
    this.syncFocusVisuals(false);
  }

  private moveCatalogCursor(offset: number): void {
    this.pokedex.ensureCatalogLoaded();
    const state = this.pokedex.catalogState();
    const items = this.pokedex.filteredCatalog().items;
    if (state.status !== 'success' || items.length === 0) return;

    const total = this.pokedex.query().trim() ? items.length : state.data.length;
    const nextIdx = Math.max(0, Math.min(total - 1, this.rpgCatalogIndex() + offset));
    this.rpgCatalogIndex.set(nextIdx);
    this.pokedex.ensureCatalogIndexVisible(nextIdx);
    setTimeout(() => this.syncFocusVisuals(true), 0);
  }

  private collectCurrentControls(): HTMLElement[] {
    const group: RpgFocusGroup = this.rpgLevel() === 'edicao' ? 'edicao' : this.rpgScreen();
    return this.collectScreenControls(group);
  }

  private collectScreenControls = (group: RpgFocusGroup) =>
    this.focusRegistry.collectGroupControls(this.hostEl, group);

  private willBlueButtonEnterSubmenu(): boolean {
    if (this.rpgLevel() === 'telas') return true;
    if (this.rpgLevel() === 'itens' && this.rpgScreen() === 'slots') {
      return this.rpgSlotFocusIndex() === TOTAL_SLOTS_AZUIS;
    }
    if (this.rpgLevel() === 'itens' && this.rpgScreen() === 'visor') {
      return this.collectScreenControls('visor')[this.rpgControlIndices().visor]?.dataset['acaoSlot'] === 'editar';
    }
    return false;
  }

  private setControlIndex(key: 'busca' | 'visor' | 'edicao', value: number): void {
    this.rpgControlIndices.update((prev) => ({ ...prev, [key]: value }));
  }
}
