import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { AuthStore } from '../../core/stores/auth.store';
import { PvMainHeadingDirective } from '../../shared/directives/main-heading.directive';
import { CharacterBazaarPanelComponent } from './components/character-bazaar-panel.component';
import { CharacterCreatorFormComponent } from './components/character-creator-form.component';
import { CharacterSheetViewComponent } from './components/character-sheet-view.component';
import { CharacterStudioStore } from './services/character-studio.store';

@Component({
  selector: 'pv-character-studio-page',
  imports: [
    PvMainHeadingDirective,
    CharacterCreatorFormComponent,
    CharacterSheetViewComponent,
    CharacterBazaarPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './character-studio-page.component.html',
  styleUrl: './character-studio-page.component.scss',
})
export class CharacterStudioPageComponent {
  readonly store = inject(CharacterStudioStore);
  readonly auth = inject(AuthStore);

  constructor() {
    effect(() => {
      this.auth.isAuthenticated();
      this.store.loadCharacters();
    });
  }
}
