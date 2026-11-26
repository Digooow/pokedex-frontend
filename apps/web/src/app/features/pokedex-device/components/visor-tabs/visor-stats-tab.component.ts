import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { type AsyncState, formatPokeApiText } from '@pokeverse/shared';
import type { AbilityDetail } from '@pokeverse/shared/pokedex-encyclopedia';
import { resolvePokemonTypeSlug } from '../../../../shared/utils/pokemon-type-style.util';
import { PvRpgFocusableDirective } from '../../directives/rpg-focusable.directive';
import type { PokemonDetailView } from '../../services/pokedex-view-mapper.util';
import {
  computeStatBarPercent,
  formatGenderRatio,
  resolveStatTier,
  translateStatName,
} from '../../services/pokedex-visor-format.util';

interface EffectivenessBucketView {
  readonly label: string;
  readonly variant: 'quad-weak' | 'weak' | 'resist' | 'quad-resist' | 'immune';
  readonly types: readonly string[];
}

@Component({
  selector: 'pv-visor-stats-tab',
  imports: [PvRpgFocusableDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    ':host { display: flex; flex-direction: column; gap: var(--pv-space-3); min-width: 0; }',
  ],
  templateUrl: './visor-stats-tab.component.html',
})
export class VisorStatsTabComponent {
  readonly typeSlug = resolvePokemonTypeSlug;
  readonly pokemon = input.required<PokemonDetailView>();
  readonly abilityDetails = input.required<Readonly<Record<string, AsyncState<AbilityDetail>>>>();

  readonly inspectAbility = output<string>();

  readonly expandedAbility = signal<string | null>(null);

  readonly statsRows = computed(() => {
    const bundleStats = this.pokemon().bundle?.pokemon.stats;
    if (bundleStats) {
      return bundleStats.map((entry) => ({
        key: entry.stat.name,
        label: translateStatName(entry.stat.name),
        value: entry.base_stat,
        effort: entry.effort,
        percent: computeStatBarPercent(entry.base_stat),
        tier: resolveStatTier(entry.base_stat),
      }));
    }
    return this.pokemon().stats.map((entry) => ({
      key: entry.label,
      label: translateStatName(entry.label),
      value: entry.value,
      effort: 0,
      percent: computeStatBarPercent(entry.value),
      tier: resolveStatTier(entry.value),
    }));
  });

  readonly baseStatTotal = computed(
    () =>
      this.pokemon().bundle?.pokemon.baseStatTotal ??
      this.statsRows().reduce((acc, item) => acc + item.value, 0),
  );

  readonly evYields = computed(() => this.statsRows().filter((row) => row.effort > 0));

  readonly effectivenessBuckets = computed<readonly EffectivenessBucketView[]>(() => {
    const matrix = this.pokemon().bundle?.typeEffectiveness;
    if (!matrix) return [];
    const groups: EffectivenessBucketView[] = [
      { label: '4x', variant: 'quad-weak', types: matrix.quadWeak.map(formatPokeApiText) },
      { label: '2x', variant: 'weak', types: matrix.weak.map(formatPokeApiText) },
      { label: '0.5x', variant: 'resist', types: matrix.resistant.map(formatPokeApiText) },
      {
        label: '0.25x',
        variant: 'quad-resist',
        types: matrix.quadResistant.map(formatPokeApiText),
      },
      { label: '0x', variant: 'immune', types: matrix.immune.map(formatPokeApiText) },
    ];
    return groups.filter((group) => group.types.length > 0);
  });

  readonly abilities = computed(() => {
    const bundleAbilities = this.pokemon().bundle?.pokemon.abilities;
    if (bundleAbilities) {
      return bundleAbilities.map((slot) => ({
        slug: slot.ability.name.toLowerCase(),
        displayName: formatPokeApiText(slot.ability.name),
        isHidden: slot.is_hidden,
        inspectable: true,
      }));
    }
    return this.pokemon().abilities.map((label) => ({
      slug: label.toLowerCase(),
      displayName: label,
      isHidden: false,
      inspectable: false,
    }));
  });

  readonly biology = computed(() => {
    const sp = this.pokemon().bundle?.species;
    if (!sp) return null;
    return {
      captureRate: sp.captureRate,
      baseHappiness: sp.baseHappiness,
      genderText: formatGenderRatio(sp.genderRate),
      hatchCycles: sp.hatchCounter,
    };
  });

  onToggleAbility(slug: string, inspectable: boolean): void {
    if (!inspectable) return;
    if (this.expandedAbility() === slug) {
      this.expandedAbility.set(null);
      return;
    }
    this.expandedAbility.set(slug);
    this.inspectAbility.emit(slug);
  }

  abilityState(slug: string): AsyncState<AbilityDetail> | null {
    return this.abilityDetails()[slug] ?? null;
  }

  abilityDescription(ability: AbilityDetail): string {
    if (ability.shortEffect) return ability.shortEffect;
    if (ability.effect) return ability.effect;
    const flavor = ability.flavorTexts.find((f) => f.language === 'en') ?? ability.flavorTexts[0];
    return flavor ? flavor.text : 'Sem descrição adicional registrada.';
  }
}
