import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { type AsyncState, normalizePokemonName } from '@pokeverse/shared';
import { Subscription } from 'rxjs';
import { AudioEngineService } from '../../core/audio/audio-engine.service';
import { PokedexApiClient } from '../pokedex-device/services/pokedex-api.client';
import {
  type PokemonDetailView,
  mapResolvedResultToAsyncState,
} from '../pokedex-device/services/pokedex-view-mapper.util';

@Injectable({ providedIn: 'root' })
export class HolocronStore implements OnDestroy {
  private readonly apiClient = inject(PokedexApiClient);
  private readonly audioEngine = inject(AudioEngineService);

  private fetchSub: Subscription | null = null;
  private lastTerm = '';

  readonly dialogOpen = signal(false);
  readonly pokemonState = signal<AsyncState<PokemonDetailView>>({ status: 'idle' });
  readonly shiny = signal(false);
  readonly autoRotate = signal(true);
  readonly webglLost = signal(false);

  openWithPokemon(pokemon: PokemonDetailView): void {
    this.fetchSub?.unsubscribe();
    this.lastTerm = pokemon.name;
    this.shiny.set(false);
    this.pokemonState.set({ status: 'success', data: pokemon });
    this.dialogOpen.set(true);
    this.audioEngine.playUiTone('holocron');
  }

  openByIdentifier(idOrName: string): void {
    const rawTerm = idOrName.trim();
    const normalized = normalizePokemonName(rawTerm);
    if (!normalized) return;

    this.fetchSub?.unsubscribe();
    this.lastTerm = rawTerm;
    this.shiny.set(false);
    this.dialogOpen.set(true);
    this.pokemonState.set({ status: 'loading' });
    this.audioEngine.playUiTone('holocron');

    this.fetchSub = this.apiClient.fetchPokemonBundle(normalized).subscribe((resolved) => {
      this.pokemonState.set(mapResolvedResultToAsyncState(resolved, rawTerm));
    });
  }

  retry(): void {
    if (this.lastTerm) {
      this.openByIdentifier(this.lastTerm);
    }
  }

  close(): void {
    this.fetchSub?.unsubscribe();
    this.audioEngine.stopCry();
    this.dialogOpen.set(false);
  }

  toggleShiny(): void {
    this.shiny.update((prev) => !prev);
  }

  toggleAutoRotate(): void {
    this.autoRotate.update((prev) => !prev);
  }

  markWebGlLost(): void {
    this.webglLost.set(true);
  }

  ngOnDestroy(): void {
    this.fetchSub?.unsubscribe();
  }
}
