import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { QualityStore } from '../../core/stores/quality.store';
import { ScenarioStore } from '../../core/stores/scenario.store';

@Component({
  selector: 'pv-cenarios-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: block;
        align-self: center;
        max-inline-size: 100%;
      }

      @media (min-width: 880px) {
        :host {
          align-self: flex-end;
        }
      }
    `,
  ],
  template: `
    <nav class="barra-cenarios" aria-label="Cenários de fundo e qualidade gráfica">
      <div class="barra-cenarios-botoes">
        <button
          type="button"
          class="btn-cenario is-active"
          (click)="scenarioStore.cycleScenario()"
          [attr.aria-label]="
            'Alternar cenário de fundo. Atual: ' + scenarioStore.activeScenarioLabel()
          "
          title="Clique para alternar o cenário de fundo"
        >
          Cenário: {{ scenarioStore.activeScenarioLabel() }}
        </button>

        <button
          type="button"
          class="btn-cenario-auto"
          [attr.aria-pressed]="scenarioStore.autoEnabled()"
          aria-label="Alternar rotação automática de cenários"
          [title]="
            scenarioStore.autoEnabled()
              ? 'Pausar troca automática de cenário'
              : 'Ativar troca automática de cenário'
          "
          (click)="scenarioStore.toggleAuto()"
        >
          Auto: {{ scenarioStore.autoEnabled() ? 'ON' : 'OFF' }}
        </button>

        <button
          type="button"
          class="btn-cenario-perf"
          [attr.data-perf-mode]="quality.tier()"
          [title]="
            quality.badgeLabel() + ' — alternar qualidade gráfica (Auto / Ultra / Equil. / Lite)'
          "
          (click)="quality.cyclePreference()"
        >
          {{ quality.badgeLabel() }}
        </button>
      </div>
    </nav>
  `,
})
export class CenariosBarComponent {
  readonly scenarioStore = inject(ScenarioStore);
  readonly quality = inject(QualityStore);
}
