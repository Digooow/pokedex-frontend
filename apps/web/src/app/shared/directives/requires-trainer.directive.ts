import { Directive, HostBinding, HostListener, input, inject } from '@angular/core';
import { AuthStore } from '../../core/stores/auth.store';

/** Marks controls as trainer-only for visitors without removing keyboard focusability. */
@Directive({
  selector: '[pvRequiresTrainer]',
})
export class RequiresTrainerDirective {
  private readonly auth = inject(AuthStore);

  readonly pvRequiresTrainer = input.required<string>();
  readonly lockedDescription = input<string>(
    'Recurso exclusivo para treinadores autenticados no servidor.',
  );

  @HostBinding('attr.aria-disabled')
  get ariaDisabled(): 'true' | null {
    return this.auth.isAuthenticated() ? null : 'true';
  }

  @HostBinding('class.is-trainer-locked')
  get isLocked(): boolean {
    return !this.auth.isAuthenticated();
  }

  @HostListener('click', ['$event'])
  onClick(event: Event): void {
    if (this.auth.isAuthenticated()) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.auth.requestTrainerAccess(this.pvRequiresTrainer(), this.lockedDescription());
  }
}
