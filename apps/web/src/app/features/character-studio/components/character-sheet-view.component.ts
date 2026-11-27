import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  CHARACTER_ATTRIBUTES_META,
  type CharacterAttributeAllocation,
  type CharacterAttributeKey,
  type CharacterSheet,
  ZERO_ATTRIBUTE_ALLOCATION,
  sumAttributeAllocation,
} from '@pokeverse/shared';
import { AuthStore } from '../../../core/stores/auth.store';
import { CharacterStudioStore } from '../services/character-studio.store';
import {
  PRESENCE_MODE_LABELS,
  adjustAllocationPoint,
} from '../services/character-studio.constants';
import { CharacterAvatarPreviewComponent } from './character-avatar-preview.component';

interface VitalBarSpec {
  readonly key: string;
  readonly label: string;
  readonly current: number;
  readonly max: number;
  readonly percent: number;
  readonly tone: 'hp' | 'stamina' | 'mana' | 'hunger' | 'thirst' | 'fatigue';
}

function toPercent(current: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((current / max) * 100)));
}

@Component({
  selector: 'pv-character-sheet-view',
  imports: [CharacterAvatarPreviewComponent],
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

  readonly pendingTotal = computed(() => sumAttributeAllocation(this.pendingAllocations()));
  readonly remainingLevelPoints = computed(() =>
    Math.max(0, this.character().availableAttributePoints - this.pendingTotal()),
  );
  readonly presenceLabel = computed(() => PRESENCE_MODE_LABELS[this.character().presenceMode]);

  readonly vitalBars = computed<readonly VitalBarSpec[]>(() => {
    const v = this.character().vitals;
    return [
      {
        key: 'hp',
        label: 'Vida (HP)',
        current: v.hpCurrent,
        max: v.hpMax,
        percent: toPercent(v.hpCurrent, v.hpMax),
        tone: 'hp',
      },
      {
        key: 'stamina',
        label: 'Fôlego',
        current: v.staminaCurrent,
        max: v.staminaMax,
        percent: toPercent(v.staminaCurrent, v.staminaMax),
        tone: 'stamina',
      },
      {
        key: 'mana',
        label: 'Mana',
        current: v.manaCurrent,
        max: v.manaMax,
        percent: toPercent(v.manaCurrent, v.manaMax),
        tone: 'mana',
      },
      {
        key: 'hunger',
        label: 'Saciedade',
        current: v.hungerCurrent,
        max: v.hungerMax,
        percent: toPercent(v.hungerCurrent, v.hungerMax),
        tone: 'hunger',
      },
      {
        key: 'thirst',
        label: 'Hidratação',
        current: v.thirstCurrent,
        max: v.thirstMax,
        percent: toPercent(v.thirstCurrent, v.thirstMax),
        tone: 'thirst',
      },
      {
        key: 'fatigue',
        label: 'Fadiga',
        current: v.fatigueCurrent,
        max: v.fatigueMax,
        percent: toPercent(v.fatigueCurrent, v.fatigueMax),
        tone: 'fatigue',
      },
    ];
  });

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
    if (sumAttributeAllocation(allocations) <= 0 || this.store.isSubmitting()) {
      return;
    }
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
