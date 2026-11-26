import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatPokeApiText } from '@pokeverse/shared';
import { buildOfficialArtworkUrl } from '../../../shared/data/regions-atlas.data';
import { MuseumStore } from '../museum.store';

@Component({
  selector: 'pv-museum-region-inspector',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './museum-region-inspector.component.html',
  styleUrl: './museum-region-inspector.component.scss',
})
export class MuseumRegionInspectorComponent {
  readonly museum = inject(MuseumStore);
  readonly holocronRequested = output<string>();

  readonly formatName = (raw: string): string => formatPokeApiText(raw);
  readonly artworkUrl = (speciesId: number): string => buildOfficialArtworkUrl(speciesId);

  onLocationFilterInput(event: Event): void {
    this.museum.setLocationQuery((event.target as HTMLInputElement).value);
  }
}
