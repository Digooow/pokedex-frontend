import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  CHARACTER_ATTRIBUTES_META,
  CHARACTER_BASE_ATTRIBUTE,
  CHARACTER_INITIAL_ATTRIBUTE_POOL,
  CHARACTER_INITIAL_PRESETS,
  CHARACTER_NAME_MAX_LENGTH,
  CHARACTER_NAME_MIN_LENGTH,
  CHARACTER_ORIGINS,
  type CharacterAttributeKey,
  type CharacterHairColor,
  type CharacterHairStyle,
  type CharacterOutfitColor,
  type CharacterOutfitStyle,
  type CharacterOriginKey,
  type CharacterSkinTone,
} from '@pokeverse/shared';
import { AuthStore } from '../../../core/stores/auth.store';
import { CharacterStudioStore } from '../services/character-studio.store';
import {
  HAIR_COLOR_OPTIONS,
  HAIR_STYLE_OPTIONS,
  OUTFIT_COLOR_OPTIONS,
  OUTFIT_STYLE_OPTIONS,
  SKIN_TONE_OPTIONS,
} from '../services/character-studio.constants';
import { CharacterAvatarPreviewComponent } from './character-avatar-preview.component';

@Component({
  selector: 'pv-character-creator-form',
  imports: [CharacterAvatarPreviewComponent],
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
  readonly skinOptions = SKIN_TONE_OPTIONS;
  readonly hairStyleOptions = HAIR_STYLE_OPTIONS;
  readonly hairColorOptions = HAIR_COLOR_OPTIONS;
  readonly outfitStyleOptions = OUTFIT_STYLE_OPTIONS;
  readonly outfitColorOptions = OUTFIT_COLOR_OPTIONS;

  onNameInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.store.setDraftName(input.value);
  }

  onOriginSelect(originKey: CharacterOriginKey): void {
    this.store.setDraftOrigin(originKey);
  }

  onSkinSelect(skinTone: CharacterSkinTone): void {
    this.store.updateAppearance({ skinTone });
  }

  onHairStyleSelect(hairStyle: CharacterHairStyle): void {
    this.store.updateAppearance({ hairStyle });
  }

  onHairColorSelect(hairColor: CharacterHairColor): void {
    this.store.updateAppearance({ hairColor });
  }

  onOutfitStyleSelect(outfitStyle: CharacterOutfitStyle): void {
    this.store.updateAppearance({ outfitStyle });
  }

  onOutfitColorSelect(outfitColor: CharacterOutfitColor): void {
    this.store.updateAppearance({ outfitColor });
  }

  onStepAttribute(key: CharacterAttributeKey, delta: number): void {
    this.store.adjustInitialPoint(key, delta);
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    this.store.submitCreate();
  }
}
