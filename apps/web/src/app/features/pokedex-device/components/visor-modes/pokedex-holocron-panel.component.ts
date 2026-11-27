import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { AudioEngineService } from '../../../../core/audio/audio-engine.service';
import { AudioStore } from '../../../../core/stores/audio.store';
import { CrySpectrogramComponent } from '../../../../shared/components/cry-spectrogram.component';
import { resolvePokemonTypeSlug } from '../../../../shared/utils/pokemon-type-style.util';
import { HolocronStageComponent } from '../../../holocron/holocron-stage.component';
import { HolocronStore } from '../../../holocron/holocron.store';
import { flattenEvolutionTree } from '../../services/pokedex-visor-format.util';

@Component({
  selector: 'pv-pokedex-holocron-panel',
  imports: [HolocronStageComponent, CrySpectrogramComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pokedex-holocron-panel.component.html',
  styleUrl: './pokedex-holocron-panel.component.scss',
})
export class PokedexHolocronPanelComponent {
  readonly holocron = inject(HolocronStore);
  readonly audioStore = inject(AudioStore);
  readonly typeSlug = resolvePokemonTypeSlug;
  private readonly audioEngine = inject(AudioEngineService);

  readonly selectSpecies = output<string>();

  readonly activePokemon = computed(() => {
    const state = this.holocron.pokemonState();
    return state.status === 'success' ? state.data : null;
  });

  readonly errorMessage = computed(() => {
    const state = this.holocron.pokemonState();
    return state.status === 'error' ? state.error : null;
  });

  readonly evolutionNodes = computed(() => {
    const chain = this.activePokemon()?.bundle?.evolutionChain;
    return chain ? flattenEvolutionTree(chain.root) : [];
  });

  onPlayCry(kind: 'latest' | 'legacy', url: string | null): void {
    this.audioEngine.playCry(kind, url);
  }
}
