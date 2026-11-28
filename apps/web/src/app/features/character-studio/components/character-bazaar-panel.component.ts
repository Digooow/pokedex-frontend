import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  BAZAAR_MAX_PRICE_COINS,
  BAZAAR_MIN_PRICE_COINS,
  CHARACTER_ATTRIBUTES_META,
  type CharacterBazaarListing,
  computeBazaarCommission,
} from '@pokeverse/shared';
import { CharacterBazaarStore } from '../services/character-bazaar.store';

type BazaarFilter = 'all' | 'male' | 'female' | 'mine';

@Component({
  selector: 'pv-character-bazaar-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './character-bazaar-panel.component.html',
  styleUrl: './character-bazaar-panel.component.scss',
})
export class CharacterBazaarPanelComponent {
  readonly store = inject(CharacterBazaarStore);

  readonly minPrice = BAZAAR_MIN_PRICE_COINS;
  readonly maxPrice = BAZAAR_MAX_PRICE_COINS;
  readonly attributesMeta = CHARACTER_ATTRIBUTES_META;
  readonly activeFilter = signal<BazaarFilter>('all');
  readonly askingPrice = signal<number>(6500);

  readonly commissionPreview = computed(() => computeBazaarCommission(this.askingPrice()));

  readonly filteredListings = computed<readonly CharacterBazaarListing[]>(() => {
    const filter = this.activeFilter();
    const list = this.store.listings();
    if (filter === 'male') return list.filter((item) => item.bodyModel === 'male');
    if (filter === 'female') return list.filter((item) => item.bodyModel === 'female');
    if (filter === 'mine') return list.filter((item) => item.isPlayerListing);
    return list;
  });

  setFilter(filter: BazaarFilter): void {
    this.activeFilter.set(filter);
  }

  onPriceInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const parsed = Number(input.value);
    if (Number.isFinite(parsed)) {
      this.askingPrice.set(parsed);
    }
  }

  onPublishActiveCharacter(): void {
    this.store.listActiveCharacter(this.askingPrice());
  }

  onSimulateBuy(listingId: string): void {
    this.store.simulatePurchase(listingId);
  }

  onRemoveListing(listingId: string): void {
    this.store.removeListing(listingId);
  }

  commissionFor(price: number) {
    return computeBazaarCommission(price);
  }
}
