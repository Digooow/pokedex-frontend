import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  CHARACTER_ATTRIBUTES_META,
  CHARACTER_BASE_ATTRIBUTE,
  CHARACTER_BODY_MODEL_META,
  CHARACTER_EMERGENT_ARCHETYPES,
  CHARACTER_INITIAL_ATTRIBUTE_POOL,
  CHARACTER_INITIAL_PRESETS,
  CHARACTER_NAME_MAX_LENGTH,
  CHARACTER_NAME_MIN_LENGTH,
  CHARACTER_ORIGINS,
  CHARACTER_PROFESSION_GROUPS,
  CHARACTER_SKILL_NODES,
  type CharacterAttributeKey,
  type CharacterBodyModel,
  type CharacterOriginKey,
} from '@pokeverse/shared';
import { AuthStore } from '../../../core/stores/auth.store';
import { CharacterStudioStore } from '../services/character-studio.store';
import { CharacterAvatarPreviewComponent } from './character-avatar-preview.component';
import { CharacterRadarChartComponent } from './character-radar-chart.component';

type ReferenceTab = 'archetypes' | 'professions' | 'skills';

@Component({
  selector: 'pv-character-creator-form',
  imports: [CharacterAvatarPreviewComponent, CharacterRadarChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './character-creator-form.component.html',
  styleUrl: './character-creator-form.component.scss',
})
export class CharacterCreatorFormComponent {
  readonly store = inject(CharacterStudioStore);
  readonly auth = inject(AuthStore);

  readonly minNameLength = CHARACTER_NAME_MIN_LENGTH;
  readonly maxNameLength = CHARACTER_NAME_MAX_LENGTH;
  readonly baseAttributeValue = CHARACTER_BASE_ATTRIBUTE;
  readonly initialPool = CHARACTER_INITIAL_ATTRIBUTE_POOL;
  readonly attributesMeta = CHARACTER_ATTRIBUTES_META;
  readonly origins = CHARACTER_ORIGINS;
  readonly presets = CHARACTER_INITIAL_PRESETS;
  readonly bodyModels = CHARACTER_BODY_MODEL_META;
  readonly archetypes = CHARACTER_EMERGENT_ARCHETYPES;
  readonly professionGroups = CHARACTER_PROFESSION_GROUPS;
  readonly skillPreviewNodes = CHARACTER_SKILL_NODES.filter((node) => node.trainable);
  readonly activeRefTab = signal<ReferenceTab>('archetypes');

  onNameInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.store.setDraftName(input.value);
  }

  onBodyModelSelect(model: CharacterBodyModel): void {
    this.store.setDraftBodyModel(model);
  }

  onOriginSelect(originKey: CharacterOriginKey): void {
    this.store.setDraftOrigin(originKey);
  }

  onStepAttribute(key: CharacterAttributeKey, delta: number): void {
    this.store.adjustInitialPoint(key, delta);
  }

  setRefTab(tab: ReferenceTab): void {
    this.activeRefTab.set(tab);
  }

  skillLabel(skillId: string): string {
    return CHARACTER_SKILL_NODES.find((node) => node.id === skillId)?.label ?? skillId;
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    this.store.submitCreate();
  }
}
