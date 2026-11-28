import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  CHARACTER_ATTRIBUTES_META,
  type CharacterAttributeAllocation,
  type CharacterAttributeKey,
  type CharacterSheet,
  ZERO_ATTRIBUTE_ALLOCATION,
  createInitialTrainingState,
  sumAttributeAllocation,
} from '@pokeverse/shared';
import { AuthStore } from '../../../core/stores/auth.store';
import { CharacterStudioStore } from '../services/character-studio.store';
import {
  PRESENCE_MODE_LABELS,
  adjustAllocationPoint,
} from '../services/character-studio.constants';
import { CharacterAvatarPreviewComponent } from './character-avatar-preview.component';
import { CharacterRadarChartComponent } from './character-radar-chart.component';
import { CharacterSkillTrainerComponent } from './character-skill-trainer.component';

interface VitalBarSpec {
  readonly key: string;
  readonly label: string;
  readonly current: number;
  readonly max: number;
  readonly percent: number;
  readonly tone: 'hp' | 'stamina' | 'mana' | 'hunger' | 'thirst' | 'fatigue';
}

function toPercent(current: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / max) * 100)));
}

@Component({
  selector: 'pv-character-sheet-view',
  imports: [
    CharacterAvatarPreviewComponent,
    CharacterRadarChartComponent,
    CharacterSkillTrainerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './character-sheet-view.component.html',
  styleUrl: './character-sheet-view.component.scss',
})
export class CharacterSheetViewComponent {
  readonly store = inject(CharacterStudioStore);
  readonly auth = inject(AuthStore);

  readonly character = input.required<CharacterSheet>();
  readonly isPreview = input<boolean>(false);

  readonly attributesMeta = CHARACTER_ATTRIBUTES_META;
  readonly pendingAllocations = signal<CharacterAttributeAllocation>({
    ...ZERO_ATTRIBUTE_ALLOCATION,
  });

  readonly trainingState = computed(
    () =>
      this.store.activeTrainingState() ??
      createInitialTrainingState(
        this.character().attributes,
        this.character().totalSkillMilestones,
      ),
  );
  readonly effectiveAttributes = computed(() => this.trainingState().attributes);
  readonly effectiveVitals = computed(
    () => this.store.activeEffectiveVitals() ?? this.character().vitals,
  );
  readonly pendingTotal = computed(() => sumAttributeAllocation(this.pendingAllocations()));
  readonly remainingLevelPoints = computed(() =>
    Math.max(0, this.character().availableAttributePoints - this.pendingTotal()),
  );
  readonly presenceLabel = computed(() => PRESENCE_MODE_LABELS[this.character().presenceMode]);

  readonly vitalBars = computed<readonly VitalBarSpec[]>(() => {
    const v = this.effectiveVitals();
    const specs: ReadonlyArray<readonly [string, string, number, number, VitalBarSpec['tone']]> = [
      ['hp', 'Vida (HP)', v.hpCurrent, v.hpMax, 'hp'],
      ['stamina', 'Fôlego', v.staminaCurrent, v.staminaMax, 'stamina'],
      ['mana', 'Mana', v.manaCurrent, v.manaMax, 'mana'],
      ['hunger', 'Saciedade', v.hungerCurrent, v.hungerMax, 'hunger'],
      ['thirst', 'Hidratação', v.thirstCurrent, v.thirstMax, 'thirst'],
      ['fatigue', 'Fadiga', v.fatigueCurrent, v.fatigueMax, 'fatigue'],
    ];
    return specs.map(([key, label, current, max, tone]) => ({
      key,
      label,
      current,
      max,
      percent: toPercent(current, max),
      tone,
    }));
  });

  attrBarPercent(key: CharacterAttributeKey): number {
    const bar = this.trainingState().attributeBars[key];
    return Math.min(100, Math.round((bar.xp / Math.max(1, bar.xpToNext)) * 100));
  }

  stepPendingPoint(key: CharacterAttributeKey, delta: number): void {
    this.pendingAllocations.update((current) =>
      adjustAllocationPoint({
        current,
        key,
        delta,
        remainingPool: this.remainingLevelPoints(),
      }),
    );
  }

  resetPending(): void {
    this.pendingAllocations.set({ ...ZERO_ATTRIBUTE_ALLOCATION });
  }

  confirmAllocation(): void {
    const allocations = this.pendingAllocations();
    if (sumAttributeAllocation(allocations) <= 0 || this.store.isSubmitting()) return;
    this.store.allocatePoints(this.character().id, allocations);
    this.resetPending();
  }

  requestLoginFromPreview(): void {
    this.auth.requestTrainerAccess(
      'Salvar Personagem na Conta',
      'Entre ou crie sua conta para gravar este personagem em definitivo no PostgreSQL.',
      '/personagem',
    );
  }
}
