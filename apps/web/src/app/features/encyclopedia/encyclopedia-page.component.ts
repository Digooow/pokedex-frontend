import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { PvMainHeadingDirective } from '../../shared/directives/main-heading.directive';
import { ENCYCLOPEDIA_CATEGORIES } from './encyclopedia-catalog.config';
import { EncyclopediaDetailPanelComponent } from './encyclopedia-detail-panel.component';
import { EncyclopediaStore } from './encyclopedia.store';

@Component({
  selector: 'pv-encyclopedia-page',
  imports: [RouterLink, PvMainHeadingDirective, EncyclopediaDetailPanelComponent],
  providers: [EncyclopediaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './encyclopedia-page.component.html',
  styleUrl: './encyclopedia-page.component.scss',
})
export class EncyclopediaPageComponent implements OnInit, OnDestroy {
  readonly store = inject(EncyclopediaStore);
  private readonly route = inject(ActivatedRoute);
  readonly categories = ENCYCLOPEDIA_CATEGORIES;
  private querySub: Subscription | null = null;

  ngOnInit(): void {
    const initialCat = this.route.snapshot.queryParamMap.get('cat');
    const initialItem = this.route.snapshot.queryParamMap.get('item');
    this.store.initFromParams(initialCat, initialItem);

    this.querySub = this.route.queryParamMap.subscribe((params) => {
      const cat = params.get('cat');
      const item = params.get('item');
      if (cat && cat !== this.store.activeCategory()) {
        this.store.initFromParams(cat, item);
      } else if (item && item !== this.store.selectedName()) {
        this.store.selectItem(item);
      }
    });
  }

  onSearchInput(event: Event): void {
    this.store.setSearchQuery((event.target as HTMLInputElement).value);
  }

  onSearchSubmit(event: Event): void {
    event.preventDefault();
    this.store.submitSearch();
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
  }
}
