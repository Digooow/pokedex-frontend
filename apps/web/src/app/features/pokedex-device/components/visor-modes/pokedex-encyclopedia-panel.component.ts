import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { isCanonicalAtlasRegion } from '../../../../shared/data/regions-atlas.data';
import { ENCYCLOPEDIA_CATEGORIES } from '../../../encyclopedia/encyclopedia-catalog.config';
import { EncyclopediaDetailPanelComponent } from '../../../encyclopedia/encyclopedia-detail-panel.component';
import { EncyclopediaStore } from '../../../encyclopedia/encyclopedia.store';
import { RegionsAtlasPanelComponent } from '../../../regions-museum/regions-atlas-panel.component';

@Component({
  selector: 'pv-pokedex-encyclopedia-panel',
  imports: [EncyclopediaDetailPanelComponent, RegionsAtlasPanelComponent],
  providers: [EncyclopediaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pokedex-encyclopedia-panel.component.html',
  styleUrl: './pokedex-encyclopedia-panel.component.scss',
})
export class PokedexEncyclopediaPanelComponent implements OnInit {
  readonly store = inject(EncyclopediaStore);
  readonly categories = ENCYCLOPEDIA_CATEGORIES;

  readonly initialCategory = input<string | null>(null);
  readonly initialItem = input<string | null>(null);
  readonly pokemonSelected = output<string>();
  readonly holocronRequested = output<string>();

  readonly isRegionsAtlasActive = computed(() => this.store.activeCategory() === 'region');
  readonly showNonCanonicalRegionDetail = computed(() => {
    const selected = this.store.selectedName();
    return this.isRegionsAtlasActive() && Boolean(selected && !isCanonicalAtlasRegion(selected));
  });

  private initialized = false;

  constructor() {
    effect(() => {
      const cat = this.initialCategory();
      const item = this.initialItem();
      untracked(() => {
        if (!this.initialized) return;
        if (cat && cat !== this.store.activeCategory()) {
          this.store.initFromParams(cat, item);
        } else if (item && item !== this.store.selectedName()) {
          if (this.store.activeCategory() === 'region' && isCanonicalAtlasRegion(item)) {
            this.store.setRegionSelection(item);
          } else {
            this.store.selectItem(item);
          }
        }
      });
    });
  }

  ngOnInit(): void {
    this.initialized = true;
    this.store.initFromParams(this.initialCategory(), this.initialItem());
  }

  onSearchInput(event: Event): void {
    this.store.setSearchQuery((event.target as HTMLInputElement).value);
  }

  onSearchSubmit(event: Event): void {
    event.preventDefault();
    this.store.submitSearch();
  }
}
