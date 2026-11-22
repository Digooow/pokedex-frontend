import { TOTAL_POKEDEX_SLOTS } from '@pokeverse/shared';

export type RpgLevel = 'telas' | 'itens' | 'edicao';
export type RpgScreen = 'busca' | 'lista' | 'visor' | 'slots';
export type RpgDirection = 'cima' | 'baixo' | 'esquerda' | 'direita';

export const DESKTOP_MIN_WIDTH_PX = 880;
export const TOTAL_SLOTS_AZUIS = TOTAL_POKEDEX_SLOTS;

const MOBILE_SCREEN_ORDER: readonly RpgScreen[] = ['busca', 'lista', 'visor', 'slots'];

const DESKTOP_SCREEN_MAP: Record<RpgScreen, Partial<Record<RpgDirection, RpgScreen>>> = {
  busca: { direita: 'visor', baixo: 'lista' },
  lista: { cima: 'busca', direita: 'slots' },
  visor: { esquerda: 'busca', baixo: 'slots' },
  slots: { cima: 'visor', esquerda: 'lista' },
};

const LIST_STEP_BY_DIR: Readonly<Record<RpgDirection, number>> = {
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

export const PRESERVED_OUTSIDE_SELECTOR =
  '.painel-busca, .painel-resultado, .pokedex-controles-fisicos, .pokedex-rodape-direito, .controle-interativo, .barra-cenarios, .hud-topbar, .hud-dock, .rodape, dialog, dialog[open]';
export const INTERNAL_INTERACTIVE_SELECTOR =
  '.painel-busca, .painel-resultado, .pokedex-controles-fisicos, .pokedex-rodape-direito, .controle-interativo';

export type RpgNavigationAction =
  | { readonly kind: 'screen'; readonly nextScreen: RpgScreen | null }
  | { readonly kind: 'catalog'; readonly offset: number }
  | { readonly kind: 'slot'; readonly nextSlotIndex: number }
  | { readonly kind: 'visor-scroll'; readonly deltaY: number }
  | { readonly kind: 'control'; readonly key: 'busca' | 'visor' | 'edicao'; readonly step: number };

export function nextSlotIndexForDirection(current: number, direction: RpgDirection): number {
  if (direction === 'esquerda') return Math.max(0, current - 1);
  if (direction === 'direita') return Math.min(TOTAL_SLOTS_AZUIS, current + 1);
  if (direction === 'baixo') return Math.min(TOTAL_SLOTS_AZUIS, current + 5);
  if (current >= TOTAL_SLOTS_AZUIS) return 5;
  return current < 5 ? current : current - 5;
}

export function resolveNextScreen(
  current: RpgScreen,
  direction: RpgDirection,
  isDesktop: boolean,
): RpgScreen | null {
  if (isDesktop) {
    return DESKTOP_SCREEN_MAP[current]?.[direction] ?? null;
  }
  const step = direction === 'cima' || direction === 'esquerda' ? -1 : 1;
  const idx = MOBILE_SCREEN_ORDER.indexOf(current);
  return MOBILE_SCREEN_ORDER[Math.max(0, Math.min(MOBILE_SCREEN_ORDER.length - 1, idx + step))] ?? null;
}

export function resolveRpgNavigationAction(
  level: RpgLevel,
  screen: RpgScreen,
  direction: RpgDirection,
  isDesktop: boolean,
  slotFocusIndex: number,
  controlsCount: number,
): RpgNavigationAction {
  if (level === 'telas') {
    return { kind: 'screen', nextScreen: resolveNextScreen(screen, direction, isDesktop) };
  }
  if (level === 'itens' && screen === 'lista') {
    return { kind: 'catalog', offset: LIST_STEP_BY_DIR[direction] };
  }
  if (level === 'itens' && screen === 'slots') {
    return { kind: 'slot', nextSlotIndex: nextSlotIndexForDirection(slotFocusIndex, direction) };
  }
  if (level === 'itens' && screen === 'visor' && controlsCount === 0) {
    const deltaY = direction === 'baixo' ? 72 : direction === 'cima' ? -72 : 0;
    return { kind: 'visor-scroll', deltaY };
  }
  const step = direction === 'cima' || direction === 'esquerda' ? -1 : 1;
  return { kind: 'control', key: resolveControlGroupKey(level, screen), step };
}

export function resolveCatalogCursorTarget(
  status: string,
  filteredCount: number,
  totalCount: number,
  query: string,
  currentIndex: number,
  offset: number,
): number | null {
  if (status !== 'success' || filteredCount === 0) return null;
  const total = query.trim() ? filteredCount : totalCount;
  return clampIndexInRange(currentIndex, offset, total);
}

export function clampIndexInRange(current: number, offset: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, current + offset));
}

export function resolveRedButtonTooltip(
  editMode: boolean,
  previousQuery: string,
  query: string,
): string {
  if (editMode) return 'Botão vermelho: sair da edição de slots';
  if (previousQuery) return `Botão vermelho: voltar para "${previousQuery}"`;
  if (query.trim()) return 'Botão vermelho: voltar para todos os Pokémon';
  return 'Botão vermelho: voltar ao início da lista';
}

export function resolveControlGroupKey(
  level: RpgLevel,
  screen: RpgScreen,
): 'busca' | 'visor' | 'edicao' {
  return level === 'edicao' ? 'edicao' : (screen as 'busca' | 'visor');
}

export function shouldBlueButtonEnterSubmenu(
  level: RpgLevel,
  screen: RpgScreen,
  slotFocusIndex: number,
  visorAction: string | undefined,
): boolean {
  if (level === 'telas') return true;
  if (level === 'itens' && screen === 'slots') return slotFocusIndex === TOTAL_SLOTS_AZUIS;
  if (level === 'itens' && screen === 'visor') return visorAction === 'editar';
  return false;
}

export function resolveStepBackTargetIdentifier(
  selectedName: string | undefined,
  highlightedName: string | null,
  currentQuery: string,
): string {
  return selectedName ?? highlightedName ?? currentQuery.toLowerCase();
}

export function belongsToSelector(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && Boolean(target.closest(selector));
}
