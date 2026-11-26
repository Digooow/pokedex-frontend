import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import {
  type AsyncState,
  type CachedPokemonEncountersResponse,
  formatPokeApiText,
} from '@pokeverse/shared';
import type { PokemonDetailView } from '../../services/pokedex-view-mapper.util';

const ENCOUNTERS_PAGE_SIZE = 12;

@Component({
  selector: 'pv-visor-map-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    ':host { display: flex; flex-direction: column; gap: var(--pv-space-3); min-width: 0; }',
  ],
  templateUrl: './visor-map-tab.component.html',
})
export class VisorMapTabComponent {
  readonly pokemon = input.required<PokemonDetailView>();
  readonly encountersState = input.required<AsyncState<CachedPokemonEncountersResponse>>();
  readonly isLite = input.required<boolean>();

  readonly retryEncounters = output<void>();

  readonly visibleLimit = signal(ENCOUNTERS_PAGE_SIZE);

  constructor() {
    let lastId: number | null = null;
    effect(() => {
      const id = this.pokemon().id;
      if (id !== lastId) {
        lastId = id;
        this.visibleLimit.set(ENCOUNTERS_PAGE_SIZE);
      }
    });
  }

  readonly encounterRows = computed(() => {
    const state = this.encountersState();
    if (state.status !== 'success') return [];
    return state.data.encounters.map((enc) => {
      const versions = enc.versionDetails.map((vd) => formatPokeApiText(vd.version));
      const allDetails = enc.versionDetails.flatMap((vd) => vd.encounterDetails);
      const minLv = allDetails.reduce(
        (min, d) => Math.min(min, d.minLevel),
        Number.MAX_SAFE_INTEGER,
      );
      const maxLv = allDetails.reduce((max, d) => Math.max(max, d.maxLevel), 0);
      const maxChance = enc.versionDetails.reduce((max, vd) => Math.max(max, vd.maxChance), 0);
      const method = allDetails[0] ? formatPokeApiText(allDetails[0].method) : 'Encontro';
      return {
        areaKey: enc.locationAreaName,
        areaLabel: formatPokeApiText(enc.locationAreaName),
        versionsLabel: versions.slice(0, 4).join(', '),
        levelRangeLabel:
          minLv !== Number.MAX_SAFE_INTEGER && maxLv > 0 ? `Nv. ${minLv}-${maxLv}` : 'Nv. variável',
        method,
        maxChance,
      };
    });
  });

  readonly visibleEncounters = computed(() => this.encounterRows().slice(0, this.visibleLimit()));
  readonly hasMoreEncounters = computed(
    () => this.visibleEncounters().length < this.encounterRows().length,
  );

  readonly historicalGallery = computed(() => {
    const sprites = this.pokemon().bundle?.pokemon.historicalSprites ?? [];
    const lite = this.isLite();
    return sprites
      .map((entry) => ({
        key: `${entry.generation}-${entry.game}`,
        label: formatPokeApiText(entry.game),
        generation: formatPokeApiText(entry.generation),
        url: lite
          ? (entry.frontDefault ?? entry.frontShiny)
          : (entry.animatedFrontDefault ?? entry.frontDefault ?? entry.frontShiny),
      }))
      .filter((entry): entry is typeof entry & { readonly url: string } => entry.url !== null);
  });

  showMoreEncounters(): void {
    this.visibleLimit.update((curr) => curr + ENCOUNTERS_PAGE_SIZE);
  }
}
