import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  type CharacterAppearance,
  type CharacterOriginKey,
  getCharacterOriginByKey,
} from '@pokeverse/shared';

@Component({
  selector: 'pv-character-avatar-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './character-avatar-preview.component.html',
  styleUrl: './character-avatar-preview.component.scss',
})
export class CharacterAvatarPreviewComponent {
  readonly appearance = input.required<CharacterAppearance>();
  readonly displayName = input<string>('Viajante');
  readonly originKey = input<CharacterOriginKey>('settler');
  readonly level = input<number>(1);
  readonly compact = input<boolean>(false);

  readonly origin = computed(() => getCharacterOriginByKey(this.originKey()));
  readonly resolvedName = computed(() => {
    const trimmed = this.displayName().trim();
    return trimmed || 'Viajante Sem Classe';
  });
}
