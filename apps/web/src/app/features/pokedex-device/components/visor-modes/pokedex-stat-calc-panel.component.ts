import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { formatPokeApiText } from '@pokeverse/shared';
import {
  DEFAULT_IV_SPREAD,
  POKEMON_NATURES,
  STAT_FIELDS,
  type StatKey,
  type StatSpreadValues,
  ZERO_SPREAD,
  clampEvChange,
  clampIvChange,
  computeCalculatorView,
} from '../../services/pokedex-stat-calc.util';
import type { PokemonDetailView } from '../../services/pokedex-view-mapper.util';

@Component({
  selector: 'pv-pokedex-stat-calc-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pokedex-stat-calc-panel.component.html',
  styleUrl: './pokedex-stat-calc-panel.component.scss',
})
export class PokedexStatCalcPanelComponent {
  readonly pokemon = input<PokemonDetailView | null>(null);
  readonly backToFicha = output<void>();

  readonly fields = STAT_FIELDS;
  readonly natures = POKEMON_NATURES;

  readonly level = signal(50);
  readonly natureKey = signal('hardy');
  readonly ivs = signal<StatSpreadValues>(DEFAULT_IV_SPREAD);
  readonly evs = signal<StatSpreadValues>(ZERO_SPREAD);

  readonly summary = computed(() => {
    const pk = this.pokemon();
    if (!pk) return null;
    return computeCalculatorView({
      pokemon: pk,
      level: this.level(),
      natureKey: this.natureKey(),
      ivs: this.ivs(),
      evs: this.evs(),
    });
  });

  readonly formatGrowthRate = (raw: string): string => formatPokeApiText(raw);

  onLevelInput(event: Event): void {
    const raw = Number.parseInt((event.target as HTMLInputElement).value, 10);
    if (Number.isFinite(raw)) {
      this.level.set(Math.max(1, Math.min(100, raw)));
    }
  }

  onNatureChange(event: Event): void {
    this.natureKey.set((event.target as HTMLSelectElement).value);
  }

  onIvInput(statKey: StatKey, event: Event): void {
    const raw = Number.parseInt((event.target as HTMLInputElement).value, 10);
    this.ivs.update((prev) => clampIvChange(prev, statKey, raw));
  }

  onEvInput(statKey: StatKey, event: Event): void {
    const raw = Number.parseInt((event.target as HTMLInputElement).value, 10);
    this.evs.update((prev) => clampEvChange(prev, statKey, raw));
  }

  setAllIvs(value: 0 | 31): void {
    this.ivs.set({
      hp: value,
      attack: value,
      defense: value,
      specialAttack: value,
      specialDefense: value,
      speed: value,
    });
  }

  applyEvPreset(preset: 'zero' | 'physical' | 'special' | 'tank'): void {
    if (preset === 'zero') {
      this.evs.set(ZERO_SPREAD);
      return;
    }
    if (preset === 'physical') {
      this.evs.set({ ...ZERO_SPREAD, hp: 4, attack: 252, speed: 252 });
      return;
    }
    if (preset === 'special') {
      this.evs.set({ ...ZERO_SPREAD, hp: 4, specialAttack: 252, speed: 252 });
      return;
    }
    this.evs.set({ ...ZERO_SPREAD, hp: 252, defense: 128, specialDefense: 128 });
  }

  statBarPercent(val: number): number {
    return Math.max(4, Math.min(100, Math.round((val / 450) * 100)));
  }
}
