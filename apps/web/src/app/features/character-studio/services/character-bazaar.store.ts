import { Injectable, computed, inject, signal } from '@angular/core';
import {
  BAZAAR_VETERAN_SHOWCASE,
  CHARACTER_SKILL_NODES,
  type CharacterBazaarListing,
  buildBazaarListingFromSheet,
  computeBazaarCommission,
} from '@pokeverse/shared';
import { AuthStore } from '../../../core/stores/auth.store';
import { extractTopTrainedSkills } from './character-studio.constants';
import { CharacterStudioStore } from './character-studio.store';

const SKILL_LABEL_MAP = new Map<string, string>(
  CHARACTER_SKILL_NODES.map((node) => [node.id, node.label]),
);

@Injectable({ providedIn: 'root' })
export class CharacterBazaarStore {
  private readonly studio = inject(CharacterStudioStore);
  private readonly auth = inject(AuthStore);

  private readonly listingsSignal =
    signal<readonly CharacterBazaarListing[]>(BAZAAR_VETERAN_SHOWCASE);
  private readonly feedbackSignal = signal<string | null>(null);

  readonly listings = this.listingsSignal.asReadonly();
  readonly feedback = this.feedbackSignal.asReadonly();
  readonly activeSheet = computed(() => this.studio.activeSheet());

  listActiveCharacter(priceCoins: number): void {
    const sheet = this.studio.activeSheet();
    const training = this.studio.activeTrainingState();
    if (!sheet || !training) return;
    const listing = buildBazaarListingFromSheet({
      sheet,
      attributes: training.attributes,
      totalMilestones: training.totalMilestones,
      askingPriceCoins: priceCoins,
      archetypeLabel: training.emergentArchetype.label,
      topSkills: extractTopTrainedSkills(training, SKILL_LABEL_MAP),
      sellerAlias: this.auth.trainer()?.username ?? 'Visitante',
    });
    this.listingsSignal.update((prev) => [
      listing,
      ...prev.filter((item) => item.id !== listing.id),
    ]);
    const fee = computeBazaarCommission(priceCoins);
    this.feedbackSignal.set(
      `${sheet.name} listado por ${fee.grossCoins} moedas (taxa ${fee.feePercent}% = ${fee.platformFeeCoins}, líquido ${fee.sellerNetCoins}).`,
    );
  }

  removeListing(listingId: string): void {
    this.listingsSignal.update((prev) => prev.filter((item) => item.id !== listingId));
    this.feedbackSignal.set('Anúncio removido da vitrine do Bazar.');
  }

  simulatePurchase(listingId: string): void {
    const target = this.listingsSignal().find((item) => item.id === listingId);
    if (!target) return;
    const fee = computeBazaarCommission(target.askingPriceCoins);
    this.feedbackSignal.set(
      `Simulação de Escrow: compra de ${target.characterName} (${fee.grossCoins} moedas · comissão ${fee.platformFeeCoins} · vendedor recebe ${fee.sellerNetCoins}).`,
    );
  }
}
