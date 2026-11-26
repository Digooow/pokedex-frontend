import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { formatPokeApiText } from '@pokeverse/shared';
import { AudioEngineService } from '../../core/audio/audio-engine.service';
import { AudioStore } from '../../core/stores/audio.store';
import { CrySpectrogramComponent } from '../../shared/components/cry-spectrogram.component';
import { DialogLightDismissDirective } from '../../shared/directives/dialog-light-dismiss.directive';
import {
  computeStatBarPercent,
  flattenEvolutionTree,
  resolveStatTier,
  translateStatName,
} from '../pokedex-device/services/pokedex-visor-format.util';
import { HolocronStageComponent } from './holocron-stage.component';
import { HolocronStore } from './holocron.store';

@Component({
  selector: 'pv-holocron-dialog',
  imports: [DialogLightDismissDirective, HolocronStageComponent, CrySpectrogramComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './holocron-dialog.component.html',
  styleUrl: './holocron-dialog.component.scss',
})
export class HolocronDialogComponent {
  readonly holocron = inject(HolocronStore);
  readonly audioStore = inject(AudioStore);
  private readonly audioEngine = inject(AudioEngineService);
  private readonly router = inject(Router);

  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

  readonly activePokemon = computed(() => {
    const state = this.holocron.pokemonState();
    return state.status === 'success' ? state.data : null;
  });

  readonly statRows = computed(() => {
    const pk = this.activePokemon();
    if (!pk) return [];
    const source =
      pk.bundle?.pokemon.stats.map((s) => ({
        label: translateStatName(s.stat.name),
        value: s.base_stat,
      })) ?? pk.stats;
    return source.map((entry) => ({
      ...entry,
      percent: computeStatBarPercent(entry.value),
      tier: resolveStatTier(entry.value),
    }));
  });

  readonly bstTotal = computed(() => this.statRows().reduce((sum, entry) => sum + entry.value, 0));

  readonly evolutionNodes = computed(() => {
    const chain = this.activePokemon()?.bundle?.evolutionChain;
    return chain ? flattenEvolutionTree(chain.root) : [];
  });

  readonly defenseSummary = computed(() => {
    const eff = this.activePokemon()?.bundle?.typeEffectiveness;
    if (!eff) return null;
    const formatTypes = (list: readonly string[]) => list.map((item) => formatPokeApiText(item));
    return {
      weak4x: formatTypes(eff.quadWeak),
      weak2x: formatTypes(eff.weak),
      immune: formatTypes(eff.immune),
    };
  });

  constructor() {
    effect(() => {
      const open = this.holocron.dialogOpen();
      const dialog = this.dialogRef()?.nativeElement;
      if (!dialog) return;
      if (!open) {
        if (dialog.open) dialog.close();
        return;
      }
      if (!dialog.open && typeof dialog.showModal === 'function') {
        dialog.showModal();
      }
    });
  }

  onPlayCry(kind: 'latest' | 'legacy', url: string | null): void {
    this.audioEngine.playCry(kind, url);
  }

  onSelectEvolution(speciesName: string): void {
    this.holocron.openByIdentifier(speciesName);
  }

  onOpenInPokedex(pokemonName: string): void {
    this.holocron.close();
    void this.router.navigate(['/pokedex'], { queryParams: { q: pokemonName } });
  }

  onNativeClose(): void {
    this.holocron.close();
  }
}
