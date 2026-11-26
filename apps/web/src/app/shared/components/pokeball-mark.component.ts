import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'pv-pokeball-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: inline-flex; flex-shrink: 0; }'],
  template: `
    <svg
      [class]="svgClass()"
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="11" fill="var(--pv-hud-pokeball-band)" />
      <path d="M 2 12 A 10 10 0 0 1 22 12 Z" fill="var(--pv-hud-pokeball-top)" />
      <path d="M 2 12 A 10 10 0 0 0 22 12 Z" fill="var(--pv-hud-pokeball-bottom)" />
      <path
        d="M 5.4 7.5 C 7 5.2 9.8 4 12.6 4.2"
        fill="none"
        stroke="var(--pv-hud-pokeball-top-hi)"
        stroke-width="1.6"
        stroke-linecap="round"
      />
      <rect x="1.5" y="10.7" width="21" height="2.6" fill="var(--pv-hud-pokeball-band)" />
      <circle cx="12" cy="12" r="4.2" fill="var(--pv-hud-pokeball-band)" />
      <circle cx="12" cy="12" r="2.8" fill="var(--pv-hud-pokeball-ring)" />
      <circle cx="12" cy="12" r="1.5" fill="var(--pv-hud-pokeball-core)" />
    </svg>
  `,
})
export class PokeballMarkComponent {
  readonly size = input<number>(18);
  readonly svgClass = input<string>('hud-brand__pokeball');
}
