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

@Injectable({ providedIn: 'root' })
export class PokedexRpgFocusRegistry {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly groups = new Map<RpgFocusGroup, Set<FocusableEntry>>();
  private readonly containers = new Map<RpgFocusGroup, HTMLElement>();
  private activeEditForm: HTMLFormElement | null = null;
  private focusedElement: HTMLElement | null = null;
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
    return () => {
      set.delete(entry);
      if (this.focusedElement === element) {
        element.classList.remove('is-rpg-foco');
        this.focusedElement = null;
      }
    };
  }

  registerContainer(group: RpgFocusGroup, element: HTMLElement): () => void {
    this.containers.set(group, element);
    return () => {
      if (this.containers.get(group) === element) this.containers.delete(group);
    };
  }

  registerEditForm(form: HTMLFormElement): () => void {
    this.activeEditForm = form;
    return () => {
      if (this.activeEditForm === form) this.activeEditForm = null;
    };
  }

  collectGroupControls(hostEl: HTMLElement | null, group: RpgFocusGroup): HTMLElement[] {
    return Array.from(this.groups.get(group) ?? [])
      .filter((entry) => this.isElementInteractable(entry.element, hostEl))
      .sort((a, b) => a.order - b.order || a.sequence - b.sequence)
      .map((entry) => entry.element);
  }

  resolveGroupTarget(
    hostEl: HTMLElement | null,
    group: RpgFocusGroup,
    rawIndex: number,
    clamp: boolean,
  ): { readonly controls: HTMLElement[]; readonly index: number; readonly target: HTMLElement | null } {
    const controls = this.collectGroupControls(hostEl, group);
    const index = clamp && controls.length > 0 ? Math.max(0, Math.min(controls.length - 1, rawIndex)) : rawIndex;
    return { controls, index, target: controls[index] ?? null };
  }

  clearFocusVisuals(): void {
    if (!this.isBrowser || !this.focusedElement) return;
    this.focusedElement.classList.remove('is-rpg-foco');
    this.focusedElement = null;
  }

  applyFocusVisuals(target: HTMLElement | null, moveDomFocus: boolean, reducedMotion: boolean): void {
    this.clearFocusVisuals();
    if (!target) return;
    target.classList.add('is-rpg-foco');
    this.focusedElement = target;
    if (moveDomFocus) {
      target.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
      target.focus?.({ preventScroll: true });
    }
  }

  scrollItemIntoViewAfterTick(
    hostEl: HTMLElement | null,
    group: RpgFocusGroup,
    index: number,
    reducedMotion: boolean,
  ): void {
    this.afterTick(() => {
      const element = this.collectGroupControls(hostEl, group)[index];
      element?.scrollIntoView?.({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    });
  }

  scrollGroupToTopAfterTick(group: RpgFocusGroup): void {
    this.afterTick(() => {
      const container = this.containers.get(group);
      if (container) container.scrollTop = 0;
    });
  }

  scrollGroupBy(group: RpgFocusGroup, deltaY: number): void {
    const container = this.isBrowser ? this.containers.get(group) : null;
    if (container) container.scrollTop += deltaY;
  }

  afterTick(task: () => void): void {
    if (this.isBrowser) setTimeout(task, 0);
  }

  submitEditForm(): void {
    this.activeEditForm?.requestSubmit?.();
  }

  blurActiveInput(): void {
    if (!this.isBrowser) return;
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
  }

  private isElementInteractable(el: HTMLElement, hostEl: HTMLElement | null): boolean {
    if (!el.isConnected) return false;
    if (hostEl && !hostEl.contains(el)) return false;
    if ('disabled' in el && Boolean((el as HTMLButtonElement | HTMLInputElement).disabled)) return false;
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

@Directive({ selector: 'form[pvRpgEditForm]' })
export class PvRpgEditFormDirective {
  private readonly elementRef = inject<ElementRef<HTMLFormElement>>(ElementRef);
  private readonly registry = inject(PokedexRpgFocusRegistry);

  constructor() {
    const unregister = this.registry.registerEditForm(this.elementRef.nativeElement);
    inject(DestroyRef).onDestroy(unregister);
  }
}
