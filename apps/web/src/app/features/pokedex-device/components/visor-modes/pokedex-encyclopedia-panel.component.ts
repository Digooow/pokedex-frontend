import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { ENCYCLOPEDIA_CATEGORIES } from '../../../encyclopedia/encyclopedia-catalog.config';
import { EncyclopediaDetailPanelComponent } from '../../../encyclopedia/encyclopedia-detail-panel.component';
import { EncyclopediaStore } from '../../../encyclopedia/encyclopedia.store';

@Component({
  selector: 'pv-pokedex-encyclopedia-panel',
  imports: [EncyclopediaDetailPanelComponent],
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

  private initialized = false;

  constructor() {
    effect(() => {
      const cat = this.initialCategory();
      const item = this.initialItem();
      if (!this.initialized) return;
      if (cat && cat !== this.store.activeCategory()) {
        this.store.initFromParams(cat, item);
      } else if (item && item !== this.store.selectedName()) {
        this.store.selectItem(item);
      }
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
