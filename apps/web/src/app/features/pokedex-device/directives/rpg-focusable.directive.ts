import { isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  Directive,
  ElementRef,
  Injectable,
  PLATFORM_ID,
  effect,
  inject,
  input,
} from '@angular/core';

export type RpgFocusGroup = 'busca' | 'lista' | 'visor' | 'slots' | 'edicao';

interface FocusableEntry {
  readonly element: HTMLElement;
  readonly order: number;
  readonly sequence: number;
}

const FALLBACK_SELECTORS: Record<
  RpgFocusGroup,
  { readonly rootSelector: string; readonly itemSelector: string }
> = {
  busca: { rootSelector: '.painel-busca-form', itemSelector: 'button:not(:disabled), input:not(:disabled)' },
  lista: { rootSelector: '#pokemon-catalogo', itemSelector: '.catalogo-item' },
  visor: { rootSelector: '.resultado-conteudo', itemSelector: 'button:not(:disabled)' },
  slots: { rootSelector: '.pokedex-rodape-direito', itemSelector: 'button:not(:disabled)' },
  edicao: { rootSelector: '.slot-form-editar', itemSelector: 'button:not(:disabled), input:not(:disabled)' },
};

@Injectable({ providedIn: 'root' })
export class PokedexRpgFocusRegistry {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly groups = new Map<RpgFocusGroup, Set<FocusableEntry>>();
  private readonly containers = new Map<RpgFocusGroup, HTMLElement>();
  private nextSequence = 0;

  register(group: RpgFocusGroup, element: HTMLElement, order?: number): () => void {
    let set = this.groups.get(group);
    if (!set) {
      set = new Set<FocusableEntry>();
      this.groups.set(group, set);
    }
    const entry: FocusableEntry = {
      element,
      order: order ?? Number.MAX_SAFE_INTEGER,
      sequence: this.nextSequence++,
    };
    set.add(entry);
    return () => set.delete(entry);
  }

  registerContainer(group: RpgFocusGroup, element: HTMLElement): () => void {
    this.containers.set(group, element);
    return () => {
      if (this.containers.get(group) === element) this.containers.delete(group);
    };
  }

  collectGroupControls(hostEl: HTMLElement | null, group: RpgFocusGroup): HTMLElement[] {
    const registered = Array.from(this.groups.get(group) ?? [])
      .filter((entry) => this.isElementInteractable(entry.element, hostEl))
      .sort((a, b) => a.order - b.order || a.sequence - b.sequence)
      .map((entry) => entry.element);
    if (registered.length > 0 || !hostEl) return registered;

    const fallback = FALLBACK_SELECTORS[group];
    const root = hostEl.querySelector(fallback.rootSelector);
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(fallback.itemSelector)).filter((el) =>
      this.isElementVisible(el),
    );
  }

  clearFocusVisuals(hostEl: HTMLElement | null): void {
    if (!this.isBrowser || !hostEl) return;
    for (const el of hostEl.querySelectorAll('.is-rpg-foco')) el.classList.remove('is-rpg-foco');
  }

  applyFocusVisuals(target: HTMLElement | null, moveDomFocus: boolean, reducedMotion: boolean): void {
    if (!target) return;
    target.classList.add('is-rpg-foco');
    if (moveDomFocus) {
      target.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
      target.focus?.({ preventScroll: true });
    }
  }

  scrollItemIntoView(element: HTMLElement | undefined, reducedMotion: boolean): void {
    element?.scrollIntoView?.({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  scrollGroupToTop(hostEl: HTMLElement | null, group: RpgFocusGroup): void {
    const container = this.resolveContainer(hostEl, group);
    if (container) container.scrollTop = 0;
  }

  scrollGroupBy(hostEl: HTMLElement | null, group: RpgFocusGroup, deltaY: number): void {
    const container = this.resolveContainer(hostEl, group);
    if (container) container.scrollTop += deltaY;
  }

  submitEditForm(hostEl: HTMLElement | null): void {
    hostEl?.querySelector<HTMLFormElement>('.slot-form-editar')?.requestSubmit?.();
  }

  hasOpenModalDialog(): boolean {
    return this.isBrowser && Boolean(document.querySelector('dialog[open]'));
  }

  blurActiveInput(): void {
    if (!this.isBrowser) return;
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
  }

  private resolveContainer(hostEl: HTMLElement | null, group: RpgFocusGroup): HTMLElement | null {
    if (!this.isBrowser) return null;
    return (
      this.containers.get(group) ??
      hostEl?.querySelector<HTMLElement>(FALLBACK_SELECTORS[group].rootSelector) ??
      null
    );
  }

  private isElementInteractable(el: HTMLElement, hostEl: HTMLElement | null): boolean {
    if (!el.isConnected) return false;
    if (hostEl && !hostEl.contains(el)) return false;
    if ('disabled' in el && Boolean((el as HTMLButtonElement | HTMLInputElement).disabled)) return false;
    return this.isElementVisible(el);
  }

  private isElementVisible(el: HTMLElement): boolean {
    return !el.hidden && !el.closest('[hidden]');
  }
}

@Directive({ selector: '[pvRpgFocusable]' })
export class PvRpgFocusableDirective {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly registry = inject(PokedexRpgFocusRegistry);
  private readonly destroyRef = inject(DestroyRef);

  readonly group = input.required<RpgFocusGroup>({ alias: 'pvRpgFocusable' });
  readonly order = input<number | undefined>(undefined, { alias: 'pvRpgOrder' });

  constructor() {
    let unregister: (() => void) | null = null;
    effect((onCleanup) => {
      unregister?.();
      unregister = this.registry.register(this.group(), this.elementRef.nativeElement, this.order());
      onCleanup(() => {
        unregister?.();
        unregister = null;
      });
    });
    this.destroyRef.onDestroy(() => unregister?.());
  }
}

@Directive({ selector: '[pvRpgContainer]' })
export class PvRpgContainerDirective {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly registry = inject(PokedexRpgFocusRegistry);
  readonly group = input.required<RpgFocusGroup>({ alias: 'pvRpgContainer' });

  constructor() {
    effect((onCleanup) =>
      onCleanup(this.registry.registerContainer(this.group(), this.elementRef.nativeElement)),
    );
  }
}
