import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import type { PerfPreference } from '@pokeverse/shared';
import { AudioStore } from '../../core/stores/audio.store';
import { QualityStore } from '../../core/stores/quality.store';
import { ScenarioStore } from '../../core/stores/scenario.store';

interface PerfOption {
  readonly id: PerfPreference;
  readonly label: string;
}

const PERF_OPTIONS: readonly PerfOption[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'ultra', label: 'Ultra' },
  { id: 'balanced', label: 'Equil.' },
  { id: 'lite', label: 'Lite' },
];

@Component({
  selector: 'pv-hud-settings-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hud-settings-menu.component.html',
  styleUrl: './hud-settings-menu.component.scss',
})
export class HudSettingsMenuComponent {
  readonly scenarioStore = inject(ScenarioStore);
  readonly quality = inject(QualityStore);
  readonly audio = inject(AudioStore);

  readonly open = input<boolean>(false);
  readonly toggled = output<void>();
  readonly closed = output<void>();

  readonly perfOptions = PERF_OPTIONS;
}
