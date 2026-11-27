import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatPokeApiText } from '@pokeverse/shared';
import {
  type MuseumSpeciesRef,
  buildOfficialArtworkUrl,
} from '../../../shared/data/regions-atlas.data';
import { MuseumStore } from '../museum.store';

interface HighlightGroup {
  readonly id: string;
  readonly title: string;
  readonly ariaLabel: string;
  readonly items: readonly MuseumSpeciesRef[];
}

@Component({
  selector: 'pv-museum-region-inspector',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './museum-region-inspector.component.html',
  styleUrl: './museum-region-inspector.component.scss',
})
export class MuseumRegionInspectorComponent {
  readonly museum = inject(MuseumStore);
  readonly pokemonSelected = output<string>();
  readonly holocronRequested = output<string>();
  readonly locationSelected = output<string>();
  readonly pokedexSelected = output<string>();

  readonly highlightGroups = computed<readonly HighlightGroup[]>(() => {
    const region = this.museum.selectedRegionMeta();
    return [
      {
        id: 'starters',
        title: 'Iniciais da Região',
        ariaLabel: 'Iniciais da região',
        items: region.starters,
      },
      {
        id: 'legendaries',
        title: 'Guardiões Lendários',
        ariaLabel: 'Guardiões lendários',
        items: region.legendaries,
      },
    ];
  });

  readonly liveRegionData = computed(() => {
    const state = this.museum.regionDetailState();
    return state.status === 'success' ? state.data : null;
  });

  readonly formatName = (raw: string): string => formatPokeApiText(raw);
  readonly artworkUrl = (speciesId: number): string => buildOfficialArtworkUrl(speciesId);

  onLocationFilterInput(event: Event): void {
    this.museum.setLocationQuery((event.target as HTMLInputElement).value);
  }
}
