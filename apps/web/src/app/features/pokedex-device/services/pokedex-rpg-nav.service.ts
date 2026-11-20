import { isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { QualityStore } from '../../../core/stores/quality.store';
import { PokedexSlotsStore } from './pokedex-slots.store';
import { PokedexStore } from './pokedex.store';

export type RpgLevel = 'telas' | 'itens' | 'edicao';
export type RpgScreen = 'busca' | 'lista' | 'visor' | 'slots';
export type RpgDirection = 'cima' | 'baixo' | 'esquerda' | 'direita';

const DURACAO_GIRO_POKEDEX_MS = 1260;
const FRAME_BUDGET_REBAIXE_MS = 30;
const MIN_FRAMES_WATCHDOG = 6;
const DESKTOP_MIN_WIDTH_PX = 880;
const TOTAL_SLOTS_AZUIS = 10;

const DESKTOP_SCREEN_MAP: Record<RpgScreen, Partial<Record<RpgDirection, RpgScreen>>> = {
  busca: { direita: 'visor', baixo: 'lista' },
  lista: { cima: 'busca', direita: 'slots' },
  visor: { esquerda: 'busca', baixo: 'slots' },
  slots: { cima: 'visor', esquerda: 'lista' },
};

const MOBILE_SCREEN_ORDER: readonly RpgScreen[] = ['busca', 'lista', 'visor', 'slots'];
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

@Injectable()
export class PokedexRpgNavService implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly quality = inject(QualityStore);
  private readonly pokedex = inject(PokedexStore);
  private readonly slotsStore = inject(PokedexSlotsStore);

  private hostEl: HTMLElement | null = null;
  private flipStartRafId = 0;
  private flipTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogRafId = 0;
  private glintRafId = 0;
  private pendingGlintX = 28;
  private pendingGlintY = 20;
  private pointerStartedPreserved = false;

  readonly isAnimating = signal(false);
  readonly isTransitioning = signal(false);
  readonly keyboardRpgActive = signal(false);
  readonly luzActive = signal(false);
  readonly luzX = signal('28%');
  readonly luzY = signal('20%');

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

  readonly redButtonTooltip = computed(() =>
    this.rpgLevel() === 'telas'
      ? 'Botão vermelho: limpar campo de busca'
      : 'Botão vermelho: voltar menu/tela (na raiz, limpa a busca)',
  );

  readonly blueButtonTooltip = computed(() =>
    this.willBlueButtonEnterSubmenu()
      ? 'Botão azul: entrar no menu destacado'
      : 'Botão azul: limpar visor de resultados',
  );

  attachHost(element: HTMLElement): void {
    this.hostEl = element;
  }

  markPointerStart(target: EventTarget | null): void {
    this.pointerStartedPreserved = this.belongsTo(target, PRESERVED_OUTSIDE_SELECTOR);
  }

  consumePointerPreserved(): boolean {
    const startedPreserved = this.pointerStartedPreserved;
    this.pointerStartedPreserved = false;
    return startedPreserved;
  }

  belongsTo(target: EventTarget | null, selector: string): boolean {
    return target instanceof Element && Boolean(target.closest(selector));
  }

  isInternalInteractiveTarget(target: EventTarget | null): boolean {
    return this.belongsTo(target, INTERNAL_INTERACTIVE_SELECTOR);
  }

  isAnyModalOpen(): boolean {
    return this.isBrowser && Boolean(document.querySelector('dialog[open]'));
  }

  onPointerMove(event: PointerEvent, deviceEl: HTMLElement): void {
    if (
      !this.isBrowser ||
      this.isAnimating() ||
      this.quality.reducedMotion() ||
      this.quality.tier() === 'lite' ||
      window.matchMedia?.('(hover: hover)')?.matches === false
    ) {
      return;
    }

    const rect = deviceEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const pctX = ((event.clientX - rect.left) / rect.width) * 100;
    const pctY = ((event.clientY - rect.top) / rect.height) * 100;
    this.pendingGlintX = Math.max(8, Math.min(92, pctX));
    this.pendingGlintY = Math.max(8, Math.min(92, pctY));
    this.luzActive.set(true);

    if (!this.glintRafId && typeof requestAnimationFrame === 'function') {
      this.glintRafId = requestAnimationFrame(() => {
        this.glintRafId = 0;
        this.luzX.set(`${this.pendingGlintX.toFixed(1)}%`);
        this.luzY.set(`${this.pendingGlintY.toFixed(1)}%`);
      });
    }
  }

  resetGlint(): void {
    if (this.glintRafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.glintRafId);
      this.glintRafId = 0;
    }
    this.luzActive.set(false);
    this.luzX.set('28%');
    this.luzY.set('20%');
  }

  isDesiredOpen(): boolean {
    if (this.isAnimating() && this.pendingTargetOpen !== null) {
      return this.pendingTargetOpen;
    }
    return this.pokedex.coverOpen();
  }

  openCover(onComplete?: () => void): void {
    const activeTarget = this.isAnimating() ? this.pendingTargetOpen : this.pokedex.coverOpen();
    if (activeTarget === true) {
      return;
    }
    this.pokedex.ensureCatalogLoaded();
    this.rpgLevel.set('telas');
    this.rpgScreen.set('busca');
    this.runLidTransition(true, onComplete);
  }

  closeCover(onComplete?: () => void): void {
    const activeTarget = this.isAnimating() ? this.pendingTargetOpen : this.pokedex.coverOpen();
    if (activeTarget === false) {
      return;
    }
    this.runLidTransition(false, onComplete);
  }

  private pendingTargetOpen: boolean | null = null;

  activateKeyboardMode(): void {
    this.keyboardRpgActive.set(true);
  }

  deactivateKeyboardMode(): void {
    if (this.keyboardRpgActive()) {
      this.keyboardRpgActive.set(false);
    }
    if (!this.isBrowser || !this.hostEl) {
      return;
    }
    for (const el of this.hostEl.querySelectorAll('.is-rpg-foco')) {
      el.classList.remove('is-rpg-foco');
    }
  }

  isScreenHighlighted(screen: RpgScreen): boolean {
    if (!this.keyboardRpgActive() || !this.pokedex.coverOpen()) {
      return false;
    }
    if (this.rpgLevel() === 'telas') {
      return this.rpgScreen() === screen;
    }
    const controls = this.collectScreenControls(screen);
    return controls.length === 0 && this.rpgScreen() === screen;
  }

  setScreenFocus(screen: RpgScreen, level: RpgLevel = 'itens', controlIdx = 0): void {
    if (this.rpgLevel() === 'edicao' && level !== 'edicao') {
      return;
    }
    this.rpgScreen.set(screen);
    this.rpgLevel.set(level);
    if (screen === 'busca' || screen === 'visor') {
      this.setControlIndex(screen, controlIdx);
    }
    this.syncFocusVisuals(false);
  }

  navigate(direction: RpgDirection): void {
    if (!this.pokedex.coverOpen()) {
      return;
    }

    if (this.rpgLevel() === 'telas') {
      this.navigateScreens(direction);
      return;
    }

    if (this.rpgLevel() === 'itens' && this.rpgScreen() === 'lista') {
      this.moveCatalogCursor(LIST_STEP_BY_DIR[direction]);
      return;
    }

    if (this.rpgLevel() === 'itens' && this.rpgScreen() === 'slots') {
      const nextSlotIdx = this.computeNextSlotIndex(this.rpgSlotFocusIndex(), direction);
      this.rpgSlotFocusIndex.set(nextSlotIdx);
      this.syncFocusVisuals(true);
      return;
    }

    const controls = this.collectCurrentControls();
    if (this.rpgLevel() === 'itens' && this.rpgScreen() === 'visor' && controls.length === 0) {
      this.scrollVisorByDirection(direction);
      return;
    }

    const key = this.rpgLevel() === 'edicao' ? 'edicao' : (this.rpgScreen() as 'busca' | 'visor');
    const step = direction === 'cima' || direction === 'esquerda' ? -1 : 1;
    const maxIdx = Math.max(0, controls.length - 1);
    const nextIdx = Math.max(0, Math.min(maxIdx, (this.rpgControlIndices()[key] ?? 0) + step));
    this.setControlIndex(key, nextIdx);
    this.syncFocusVisuals(true);
  }

  enterScreen(screen: RpgScreen): void {
    this.rpgScreen.set(screen);
    this.rpgLevel.set('itens');
    if (screen === 'lista') {
      this.pokedex.ensureCatalogLoaded();
    }
    this.syncFocusVisuals(true);
  }

  goBackOrClearForm(onClearForm: () => void): void {
    if (this.rpgLevel() === 'edicao') {
      this.slotsStore.setEditingSlotIndex(null);
      this.rpgLevel.set('itens');
      this.rpgScreen.set('visor');
      this.syncFocusVisuals(true);
      return;
    }
    if (this.rpgLevel() === 'itens') {
      this.blurActiveInput();
      this.rpgLevel.set('telas');
      this.syncFocusVisuals(false);
      return;
    }
    onClearForm();
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
      const visibleItems = this.pokedex.filteredCatalog().items;
      const picked = visibleItems[this.rpgCatalogIndex()];
      if (picked) {
        this.pokedex.setQuery(picked.name);
        this.pokedex.loadPokemonDetail(picked.name);
      }
      return;
    }

    const controls = this.collectCurrentControls();
    const key =
      this.rpgLevel() === 'edicao' ? 'edicao' : (this.rpgScreen() as 'busca' | 'visor' | 'slots');
    const idx =
      key === 'slots' ? this.rpgSlotFocusIndex() : (this.rpgControlIndices()[key] ?? 0);
    const target = controls[idx];
    if (!target) {
      return;
    }

    if (this.rpgLevel() === 'edicao' && target !== controls[3]) {
      const form = this.hostEl?.querySelector<HTMLFormElement>('.slot-form-editar');
      form?.requestSubmit?.();
      return;
    }

    if (target.id === 'btn-config-slots') {
      onToggleConfig(true);
      return;
    }

    target.click();
  }

  syncFocusVisuals(moveDomFocus: boolean): void {
    if (!this.isBrowser || !this.hostEl) {
      return;
    }
    for (const el of this.hostEl.querySelectorAll('.is-rpg-foco')) {
      el.classList.remove('is-rpg-foco');
    }
    if (!this.keyboardRpgActive() || !this.pokedex.coverOpen() || this.rpgLevel() === 'telas') {
      return;
    }

    let target: HTMLElement | null = null;
    if (this.rpgScreen() === 'lista') {
      const items = this.hostEl.querySelectorAll<HTMLElement>('.catalogo-item');
      target = items[this.rpgCatalogIndex()] ?? null;
    } else if (this.rpgScreen() === 'slots') {
      const controls = this.collectScreenControls('slots');
      target = controls[this.rpgSlotFocusIndex()] ?? null;
    } else {
      const key = this.rpgLevel() === 'edicao' ? 'edicao' : (this.rpgScreen() as 'busca' | 'visor');
      const controls = this.collectCurrentControls();
      const idx = Math.max(0, Math.min(controls.length - 1, this.rpgControlIndices()[key] ?? 0));
      if (idx !== this.rpgControlIndices()[key]) {
        this.setControlIndex(key, idx);
      }
      target = controls[idx] ?? null;
    }

    if (!target) {
      return;
    }
    target.classList.add('is-rpg-foco');
    if (moveDomFocus) {
      target.scrollIntoView?.({
        block: 'nearest',
        behavior: this.quality.reducedMotion() ? 'auto' : 'smooth',
      });
      target.focus?.({ preventScroll: true });
    }
  }

  syncCatalogSelection(pokemonName: string): void {
    const items = this.pokedex.filteredCatalog().items;
    const idx = items.findIndex((entry) => entry.name === pokemonName.toLowerCase());
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

  private runLidTransition(open: boolean, onComplete?: () => void): void {
    const wasTransitioning = this.isAnimating() && this.isTransitioning();
    this.clearTimers();
    this.stopWatchdog();
    this.pendingTargetOpen = open;

    const host = this.hostEl;
    const skipMotion = this.quality.reducedMotion() || this.quality.tier() === 'lite';
    if (skipMotion || !host) {
      host?.classList.remove('is-transicionando', 'is-animando');
      this.pendingTargetOpen = null;
      this.isTransitioning.set(false);
      this.isAnimating.set(false);
      this.pokedex.setCoverOpen(open);
      this.syncFocusVisuals(false);
      onComplete?.();
      return;
    }

    const scheduleCompletion = () => {
      this.startWatchdog();
      this.flipTimer = setTimeout(() => {
        this.flipTimer = null;
        this.stopWatchdog();
        this.pendingTargetOpen = null;
        host.classList.remove('is-transicionando', 'is-animando');
        this.isTransitioning.set(false);
        this.isAnimating.set(false);
        this.syncFocusVisuals(false);
        onComplete?.();
      }, DURACAO_GIRO_POKEDEX_MS);
    };

    if (wasTransitioning) {
      host.getBoundingClientRect();
      this.pokedex.setCoverOpen(open);
      scheduleCompletion();
      return;
    }

    host.classList.remove('is-transicionando');
    host.classList.add('is-animando');
    this.isTransitioning.set(false);
    this.isAnimating.set(true);
    host.getBoundingClientRect();

    const scheduleNextFrame =
      typeof requestAnimationFrame === 'function'
        ? (cb: () => void) => requestAnimationFrame(cb)
        : (cb: () => void) => setTimeout(cb, 0) as unknown as number;

    this.flipStartRafId = scheduleNextFrame(() => {
      this.flipStartRafId = 0;
      const target = this.pendingTargetOpen ?? open;
      host.classList.add('is-transicionando');
      host.getBoundingClientRect();
      this.isTransitioning.set(true);
      this.pokedex.setCoverOpen(target);
      scheduleCompletion();
    });
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    if (
      !this.isBrowser ||
      this.quality.preference() !== 'auto' ||
      this.quality.tier() === 'lite' ||
      typeof requestAnimationFrame !== 'function'
    ) {
      return;
    }

    let lastTime = performance.now();
    let frameCount = 0;
    let deltaSum = 0;

    const sample = (now: number) => {
      this.watchdogRafId = 0;
      if (!this.isAnimating() || document.hidden) {
        return;
      }
      const delta = now - lastTime;
      lastTime = now;
      if (delta > 0 && delta < 250) {
        frameCount += 1;
        deltaSum += delta;
      }
      if (frameCount >= MIN_FRAMES_WATCHDOG && deltaSum / frameCount > FRAME_BUDGET_REBAIXE_MS) {
        this.quality.downgradeAutoTier();
        return;
      }
      this.watchdogRafId = requestAnimationFrame(sample);
    };

    this.watchdogRafId = requestAnimationFrame(sample);
  }

  private stopWatchdog(): void {
    if (this.watchdogRafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.watchdogRafId);
      this.watchdogRafId = 0;
    }
  }

  private clearTimers(): void {
    if (this.flipStartRafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.flipStartRafId);
      this.flipStartRafId = 0;
    }
    if (this.flipTimer !== null) {
      clearTimeout(this.flipTimer);
      this.flipTimer = null;
    }
  }

  private navigateScreens(direction: RpgDirection): void {
    const desktop =
      !this.isBrowser || (window.innerWidth >= DESKTOP_MIN_WIDTH_PX);
    if (desktop) {
      const next = DESKTOP_SCREEN_MAP[this.rpgScreen()]?.[direction];
      if (next) {
        this.rpgScreen.set(next);
      }
    } else {
      const step = direction === 'cima' || direction === 'esquerda' ? -1 : 1;
      const idx = MOBILE_SCREEN_ORDER.indexOf(this.rpgScreen());
      const nextIdx = Math.max(0, Math.min(MOBILE_SCREEN_ORDER.length - 1, idx + step));
      const targetScreen = MOBILE_SCREEN_ORDER[nextIdx];
      if (targetScreen) {
        this.rpgScreen.set(targetScreen);
      }
    }
    this.syncFocusVisuals(false);
  }

  private moveCatalogCursor(offset: number): void {
    this.pokedex.ensureCatalogLoaded();
    const state = this.pokedex.catalogState();
    const items = this.pokedex.filteredCatalog().items;
    if (state.status !== 'success' || items.length === 0) {
      return;
    }
    const totalAvailable = this.pokedex.query().trim()
      ? items.length
      : state.data.length;
    const nextIdx = Math.max(0, Math.min(totalAvailable - 1, this.rpgCatalogIndex() + offset));
    this.rpgCatalogIndex.set(nextIdx);
    this.pokedex.ensureCatalogIndexVisible(nextIdx);
    setTimeout(() => this.syncFocusVisuals(true), 0);
  }

  private computeNextSlotIndex(current: number, direction: RpgDirection): number {
    if (direction === 'esquerda') return Math.max(0, current - 1);
    if (direction === 'direita') return Math.min(TOTAL_SLOTS_AZUIS, current + 1);
    if (direction === 'baixo') return Math.min(TOTAL_SLOTS_AZUIS, current + 5);
    if (current >= TOTAL_SLOTS_AZUIS) return 5;
    if (current < 5) return current;
    return current - 5;
  }

  private scrollVisorByDirection(direction: RpgDirection): void {
    const visorBody = this.hostEl?.querySelector<HTMLElement>('.resultado-conteudo');
    if (!visorBody) {
      return;
    }
    if (direction === 'baixo') visorBody.scrollTop += 72;
    if (direction === 'cima') visorBody.scrollTop -= 72;
  }

  private collectCurrentControls(): HTMLElement[] {
    if (this.rpgLevel() === 'edicao') {
      const form = this.hostEl?.querySelector('.slot-form-editar') ?? null;
      return this.collectInteractiveElements(form, true);
    }
    return this.collectScreenControls(this.rpgScreen());
  }

  private collectScreenControls(screen: RpgScreen): HTMLElement[] {
    if (!this.hostEl) {
      return [];
    }
    if (screen === 'busca') {
      return this.collectInteractiveElements(this.hostEl.querySelector('.painel-busca-form'), true);
    }
    if (screen === 'slots') {
      return this.collectInteractiveElements(
        this.hostEl.querySelector('.pokedex-rodape-direito'),
        false,
      );
    }
    if (screen === 'visor') {
      return this.collectInteractiveElements(this.hostEl.querySelector('.resultado-conteudo'), false);
    }
    return [];
  }

  private collectInteractiveElements(root: Element | null, includeInputs: boolean): HTMLElement[] {
    if (!root) {
      return [];
    }
    const selector = includeInputs ? 'button:not(:disabled), input:not(:disabled)' : 'button:not(:disabled)';
    return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
      (el) => !el.hidden && !el.closest('[hidden]'),
    );
  }

  private willBlueButtonEnterSubmenu(): boolean {
    if (this.rpgLevel() === 'telas') {
      return true;
    }
    if (this.rpgLevel() === 'itens' && this.rpgScreen() === 'slots') {
      return this.rpgSlotFocusIndex() === TOTAL_SLOTS_AZUIS;
    }
    if (this.rpgLevel() === 'itens' && this.rpgScreen() === 'visor') {
      const controls = this.collectScreenControls('visor');
      const target = controls[this.rpgControlIndices().visor];
      return target?.dataset['acaoSlot'] === 'editar';
    }
    return false;
  }

  private setControlIndex(key: 'busca' | 'visor' | 'edicao', value: number): void {
    this.rpgControlIndices.update((prev) => ({ ...prev, [key]: value }));
  }

  private blurActiveInput(): void {
    if (!this.isBrowser) {
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLInputElement) {
      active.blur();
    }
  }

  ngOnDestroy(): void {
    this.clearTimers();
    this.stopWatchdog();
    if (this.glintRafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.glintRafId);
    }
  }
}
