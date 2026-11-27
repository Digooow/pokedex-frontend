import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import {
  REGIONS_ATLAS_PREVIEW,
  isCanonicalAtlasRegion,
} from '../../shared/data/regions-atlas.data';
import { MuseumRegionInspectorComponent } from './components/museum-region-inspector.component';
import { MuseumStore } from './museum.store';

@Component({
  selector: 'pv-regions-atlas-panel',
  imports: [MuseumRegionInspectorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './regions-atlas-panel.component.html',
  styleUrl: './regions-atlas-panel.component.scss',
})
export class RegionsAtlasPanelComponent {
  readonly museum = inject(MuseumStore);
  readonly regions = REGIONS_ATLAS_PREVIEW;

  readonly selectedRegion = input<string | null>(null);
  readonly regionSelected = output<string>();
  readonly pokemonSelected = output<string>();
  readonly holocronRequested = output<string>();
  readonly locationSelected = output<string>();
  readonly pokedexSelected = output<string>();

  readonly hasCustomNonCanonicalRegion = computed(() => {
    const selected = this.selectedRegion();
    return Boolean(selected && !isCanonicalAtlasRegion(selected));
  });

  readonly activeCanonicalRegionId = computed(() =>
    this.hasCustomNonCanonicalRegion() ? null : this.museum.selectedRegionId(),
  );

  constructor() {
    effect(() => {
      const target = this.selectedRegion();
      untracked(() => {
        if (target && isCanonicalAtlasRegion(target)) {
          const normalized = target.trim().toLowerCase();
          if (
            this.museum.selectedRegionId() !== normalized ||
            this.museum.regionDetailState().status === 'idle'
          ) {
            this.museum.selectRegion(normalized);
          }
          return;
        }
        if (!target && this.museum.regionDetailState().status === 'idle') {
          this.museum.selectRegion(this.museum.selectedRegionId());
        }
      });
    });
  }

  onSelectRegion(regionId: string): void {
    this.museum.selectRegion(regionId);
    this.regionSelected.emit(regionId);
  }
}
