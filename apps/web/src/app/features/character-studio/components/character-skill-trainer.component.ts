import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  CHARACTER_ATTRIBUTES_META,
  CHARACTER_SKILL_NODES,
  type CharacterAttributeKey,
  type CharacterSkillNode,
  type CharacterTrainingState,
  SKILL_PILLAR_META,
  type SkillPillarKey,
  computeSkillChainModifier,
  getSkillAncestorChain,
} from '@pokeverse/shared';
import { CharacterStudioStore } from '../services/character-studio.store';

interface SkillViewRow {
  readonly node: CharacterSkillNode;
  readonly rank: number;
  readonly xp: number;
  readonly xpToNext: number;
  readonly xpPercent: number;
  readonly chainLabel: string;
  readonly chainModifier: number;
  readonly attrPairLabel: string;
}

const ATTR_SHORT_MAP = new Map<CharacterAttributeKey, string>(
  CHARACTER_ATTRIBUTES_META.map((meta) => [meta.key, meta.shortLabel]),
);

@Component({
  selector: 'pv-character-skill-trainer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './character-skill-trainer.component.html',
  styleUrl: './character-skill-trainer.component.scss',
})
export class CharacterSkillTrainerComponent {
  readonly store = inject(CharacterStudioStore);

  readonly training = input.required<CharacterTrainingState>();

  readonly activePillar = signal<SkillPillarKey>('combat');
  readonly pillars = SKILL_PILLAR_META;

  readonly activePillarHint = computed(
    () => this.pillars.find((p) => p.key === this.activePillar())?.hint ?? '',
  );

  readonly skillRows = computed<readonly SkillViewRow[]>(() => {
    const pillar = this.activePillar();
    const state = this.training();
    return CHARACTER_SKILL_NODES.filter((node) => node.pillar === pillar && node.trainable).map(
      (node) => {
        const entry = state.skills[node.id] ?? { rank: 0, xp: 0, xpToNext: 40 };
        const chain = getSkillAncestorChain(node.id);
        const chainLabel = chain
          .slice()
          .reverse()
          .map((item) => item.label)
          .join(' → ');
        const primary = ATTR_SHORT_MAP.get(node.primaryAttr) ?? node.primaryAttr;
        const secondary = ATTR_SHORT_MAP.get(node.secondaryAttr) ?? node.secondaryAttr;
        return {
          node,
          rank: entry.rank,
          xp: entry.xp,
          xpToNext: entry.xpToNext,
          xpPercent: Math.min(100, Math.round((entry.xp / Math.max(1, entry.xpToNext)) * 100)),
          chainLabel,
          chainModifier: computeSkillChainModifier(node.id, state.skills),
          attrPairLabel: `${primary} + ${secondary}`,
        };
      },
    );
  });

  readonly lastResult = computed(() => this.store.lastTrainingResult());

  selectPillar(pillar: SkillPillarKey): void {
    this.activePillar.set(pillar);
  }

  onTrainSkill(skillId: string): void {
    this.store.trainSkill(skillId);
  }

  attrLabel(key: CharacterAttributeKey): string {
    return ATTR_SHORT_MAP.get(key) ?? key;
  }
}
