import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { AuthStore } from '../../../core/stores/auth.store';
import { PrivacyConsentStore } from '../../../core/stores/privacy-consent.store';
import { PokedexRpgNavService } from './pokedex-rpg-nav.service';
import {
  INTERNAL_INTERACTIVE_SELECTOR,
  KEY_TO_DIRECTION,
  PRESERVED_OUTSIDE_SELECTOR,
  type RpgDirection,
  belongsToSelector,
} from './pokedex-rpg-nav.util';
import { PokedexSlotsStore } from './pokedex-slots.store';
import { PokedexStore } from './pokedex.store';

export interface PokedexShortcutCallbacks {
  readonly onClose: (returnFocusToCover: boolean) => void;
  readonly onStepBack: () => void;
  readonly onConfirmA: () => void;
}

@Injectable()
export class PokedexInputShortcutsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthStore);
  private readonly privacy = inject(PrivacyConsentStore);
  private readonly slotsStore = inject(PokedexSlotsStore);
  private readonly store = inject(PokedexStore);
  private readonly rpg = inject(PokedexRpgNavService);

  private callbacks: PokedexShortcutCallbacks | null = null;
  private pointerStartedPreserved = false;
  private attached = false;

  private readonly onDocPointerDown = (event: Event) => {
    this.rpg.deactivateKeyboardMode();
    this.pointerStartedPreserved = belongsToSelector(event.target, PRESERVED_OUTSIDE_SELECTOR);
  };

  private readonly onDocClick = (event: Event) => {
    const startedPreserved = this.consumePointerPreserved();
    if (!this.rpg.isDesiredOpen() || this.isAnyModalOpen()) return;
    const target = event.target;
    if (
      startedPreserved ||
      (target instanceof Node && !target.isConnected) ||
      belongsToSelector(target, PRESERVED_OUTSIDE_SELECTOR)
    ) {
      return;
    }
    this.callbacks?.onClose(false);
  };

  private readonly onDocKeyDown = (event: KeyboardEvent) => {
    if (!this.store.coverOpen() || this.isAnyModalOpen()) return;
    if (event.key === 'Escape') {
      this.callbacks?.onClose(true);
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

  attach(callbacks: PokedexShortcutCallbacks): void {
    this.callbacks = callbacks;
    if (!this.isBrowser || this.attached) return;
    this.attached = true;
    document.addEventListener('pointerdown', this.onDocPointerDown);
    document.addEventListener('mousedown', this.onDocPointerDown);
    document.addEventListener('click', this.onDocClick);
    document.addEventListener('keydown', this.onDocKeyDown);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('pointerdown', this.onDocPointerDown);
      document.removeEventListener('mousedown', this.onDocPointerDown);
      document.removeEventListener('click', this.onDocClick);
      document.removeEventListener('keydown', this.onDocKeyDown);
      this.attached = false;
    });
  }

  isAnyModalOpen = () =>
    this.slotsStore.pendingConfirm() !== null ||
    this.auth.visitorPrompt() !== null ||
    this.auth.securityModalOpen() ||
    this.privacy.dialogOpen();

  consumePointerPreserved(): boolean {
    const startedPreserved = this.pointerStartedPreserved;
    this.pointerStartedPreserved = false;
    return startedPreserved;
  }

  shouldIgnoreDeviceClick(target: EventTarget | null): boolean {
    const startedPreserved = this.consumePointerPreserved();
    return (
      startedPreserved ||
      (target instanceof Node && !target.isConnected) ||
      (!this.rpg.isAnimating() && belongsToSelector(target, INTERNAL_INTERACTIVE_SELECTOR)) ||
      (!this.rpg.isAnimating() && belongsToSelector(target, '#tampa-frente'))
    );
  }

  private isEditableControl(target: HTMLElement | null): target is HTMLElement {
    if (!target) return false;
    return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
  }

  private handleInputKeyDown(
    event: KeyboardEvent,
    target: HTMLElement,
    direction: RpgDirection | undefined,
  ): void {
    if (!direction) return;
    if (target.classList.contains('slot-form-input')) {
      if (direction === 'cima' || direction === 'baixo') {
        event.preventDefault();
        this.rpg.navigate(direction);
      }
      return;
    }
    if (target.id !== 'pokemon-input') return;
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
      this.rpg.setScreenFocus('busca', 'telas');
    }
  }

  private handleStageKeyDown(
    event: KeyboardEvent,
    target: HTMLElement | null,
    direction: RpgDirection | undefined,
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
      this.callbacks?.onConfirmA();
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      this.rpg.goBackOrClearForm(() => this.callbacks?.onStepBack(), true);
    }
  }
}
