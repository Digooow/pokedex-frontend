import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { RpgDirection } from '../services/pokedex-rpg-nav.util';

@Component({
  selector: 'pv-pokedex-physical-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: contents;
      }
    `,
  ],
  templateUrl: './pokedex-physical-controls.component.html',
})
export class PokedexPhysicalControlsComponent {
  readonly redTooltip = input.required<string>();
  readonly blueTooltip = input.required<string>();

  readonly dpadPressed = output<RpgDirection>();
  readonly redPressed = output<void>();
  readonly bluePressed = output<void>();
  readonly aPressed = output<void>();

  onDpad(direction: RpgDirection, event: Event): void {
    this.consumeControlEvent(event);
    this.dpadPressed.emit(direction);
  }

  onRed(event: Event): void {
    this.consumeControlEvent(event);
    this.redPressed.emit();
  }

  onBlue(event: Event): void {
    this.consumeControlEvent(event);
    this.bluePressed.emit();
  }

  onA(event: Event): void {
    this.consumeControlEvent(event);
    this.aPressed.emit();
  }

  private consumeControlEvent(event: Event): void {
    event.stopPropagation();
    (event.currentTarget as HTMLElement | null)?.blur?.();
  }
}
