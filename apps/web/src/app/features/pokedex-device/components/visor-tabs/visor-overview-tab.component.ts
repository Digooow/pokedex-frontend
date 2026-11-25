import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { formatPokeApiText } from '@pokeverse/shared';
import { PvRpgFocusableDirective } from '../../directives/rpg-focusable.directive';
import type { PokemonDetailView } from '../../services/pokedex-view-mapper.util';
import {
  type VisorSpriteMode,
  hasHomeSprite,
  hasShinySprite,
  hasShowdownSprite,
  pickLocalizedFlavorEntry,
  resolveVisorSpriteUrl,
} from '../../services/pokedex-visor-format.util';

@Component({
  selector: 'pv-visor-overview-tab',
  imports: [PvRpgFocusableDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: flex; flex-direction: column; gap: var(--espaco-3); min-width: 0; }'],
  templateUrl: './visor-overview-tab.component.html',
})
export class VisorOverviewTabComponent {
  readonly pokemon = input.required<PokemonDetailView>();
  readonly spriteMode = input.required<VisorSpriteMode>();
  readonly shiny = input.required<boolean>();
  readonly isLite = input.required<boolean>();
  readonly playingCry = input<'latest' | 'legacy' | null>(null);
  readonly cryError = input<string | null>(null);

  readonly toggleShiny = output<void>();
  readonly selectSpriteMode = output<VisorSpriteMode>();
  readonly playCry = output<'latest' | 'legacy'>();

  private readonly usedFallbackSprite = signal(false);
  readonly imageFailed = signal(false);

  constructor() {
    effect(() => {
      this.pokemon();
      this.spriteMode();
      this.shiny();
      this.usedFallbackSprite.set(false);
      this.imageFailed.set(false);
    });
  }

  readonly spriteUrls = computed(() =>
    resolveVisorSpriteUrl(this.pokemon(), this.spriteMode(), this.shiny(), this.isLite()),
  );
  readonly canShiny = computed(() => hasShinySprite(this.pokemon()));
  readonly canHome = computed(() => hasHomeSprite(this.pokemon()));
  readonly canShowdown = computed(() => !this.isLite() && hasShowdownSprite(this.pokemon()));
  readonly species = computed(() => this.pokemon().bundle?.species ?? null);
  readonly cries = computed(() => this.pokemon().bundle?.pokemon.cries ?? null);
  readonly flavorEntry = computed(() => {
    const sp = this.species();
    return sp ? pickLocalizedFlavorEntry(sp) : null;
  });

  readonly activeSpriteUrl = computed(() => {
    if (this.imageFailed()) return null;
    const urls = this.spriteUrls();
    if (this.usedFallbackSprite()) return urls.fallback;
    return urls.primary ?? urls.fallback;
  });

  readonly formatLabel = (raw: string | null | undefined): string =>
    raw ? formatPokeApiText(raw) : 'Não informado';

  onSpriteError(): void {
    const urls = this.spriteUrls();
    if (!this.usedFallbackSprite() && urls.fallback && urls.fallback !== urls.primary) {
      this.usedFallbackSprite.set(true);
      return;
    }
    this.imageFailed.set(true);
  }
}
