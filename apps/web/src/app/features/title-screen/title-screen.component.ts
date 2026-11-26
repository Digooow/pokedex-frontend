import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PokeballMarkComponent } from '../../shared/components/pokeball-mark.component';
import { PvMainHeadingDirective } from '../../shared/directives/main-heading.directive';

@Component({
  selector: 'pv-title-screen',
  imports: [RouterLink, PvMainHeadingDirective, PokeballMarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './title-screen.component.html',
  styleUrl: './title-screen.component.scss',
})
export class TitleScreenComponent {
  private readonly router = inject(Router);

  @HostListener('window:keydown', ['$event'])
  onStartShortcut(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.matches('input, textarea, select, button, a, [contenteditable]') ||
        target.closest('dialog[open]') !== null)
    ) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void this.router.navigateByUrl('/inicio');
    }
  }
}
