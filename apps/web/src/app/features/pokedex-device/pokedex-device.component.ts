import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input } from '@angular/core';
import { TOTAL_POKEDEX_SLOTS } from '@pokeverse/shared';
import { RequiresTrainerDirective } from '../../shared/directives/requires-trainer.directive';
import { PokedexSearchPanelComponent } from './components/pokedex-search-panel.component';
import { PokedexVisorComponent } from './components/pokedex-visor.component';
import { PokedexStore, type ScenarioId } from './services/pokedex.store';

interface ScenarioOption {
  readonly id: ScenarioId;
  readonly label: string;
  readonly baseFile: string;
}

const SCENARIO_OPTIONS: readonly ScenarioOption[] = [
  { id: 'hoenn', label: 'Hoenn', baseFile: 'mirante-hoenn' },
  { id: 'cidade', label: 'Cidade', baseFile: 'cidade-anime' },
  { id: 'vila', label: 'Vila', baseFile: 'vila-pallet' },
  { id: 'floresta', label: 'Floresta', baseFile: 'floresta-sol' },
];

@Component({
  selector: 'pv-pokedex-device-page',
  imports: [PokedexSearchPanelComponent, PokedexVisorComponent, RequiresTrainerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pokedex-device.component.html',
  styleUrl: './pokedex-device.component.scss',
})
export class PokedexDevicePageComponent implements OnInit {
  readonly store = inject(PokedexStore);
  readonly q = input<string>();

  readonly scenarios = SCENARIO_OPTIONS;
  readonly slotIndices = Array.from({ length: TOTAL_POKEDEX_SLOTS }, (_, index) => index);

  readonly activeBackdrop = computed(() => {
    const chosen = SCENARIO_OPTIONS.find((item) => item.id === this.store.scenario());
    const base = chosen?.baseFile ?? 'mirante-hoenn';
    return {
      mobile: `assets/backgrounds/${base}-mobile.webp`,
      desktop: `assets/backgrounds/${base}-desktop.webp`,
    };
  });

  ngOnInit(): void {
    this.store.ensureCatalogLoaded();
    const initialQuery = this.q()?.trim();
    if (initialQuery) {
      this.store.searchOrSelect(initialQuery);
    }
  }

  retrySelected(): void {
    const term = this.store.query().trim() || String(this.store.selectedId() ?? 'pikachu');
    this.store.loadPokemonDetail(term);
  }
}
