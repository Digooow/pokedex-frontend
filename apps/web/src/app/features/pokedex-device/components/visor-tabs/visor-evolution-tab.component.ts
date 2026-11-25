import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  type AsyncState,
  type CachedPokemonFormsResponse,
  formatPokeApiText,
} from '@pokeverse/shared';
import { PvRpgFocusableDirective } from '../../directives/rpg-focusable.directive';
import type { PokemonDetailView } from '../../services/pokedex-view-mapper.util';
import { flattenEvolutionTree } from '../../services/pokedex-visor-format.util';

@Component({
  selector: 'pv-visor-evolution-tab',
  imports: [PvRpgFocusableDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: flex; flex-direction: column; gap: var(--espaco-3); min-width: 0; }'],
  templateUrl: './visor-evolution-tab.component.html',
})
export class VisorEvolutionTabComponent {
  readonly pokemon = input.required<PokemonDetailView>();
  readonly formsState = input.required<AsyncState<CachedPokemonFormsResponse>>();

  readonly selectPokemon = output<string>();
  readonly retryForms = output<void>();

  readonly evolutionNodes = computed(() => {
    const chain = this.pokemon().bundle?.evolutionChain;
    return chain ? flattenEvolutionTree(chain.root) : [];
  });

  readonly varieties = computed(() => {
    const list = this.pokemon().bundle?.species.varieties ?? [];
    return list.map((item) => ({
      ...item,
      displayName: formatPokeApiText(item.pokemonName),
      isCurrent: item.pokemonName.toLowerCase() === this.pokemon().name,
    }));
  });

  readonly forms = computed(() => {
    const state = this.formsState();
    if (state.status !== 'success') return [];
    return state.data.forms.map((form) => ({
      ...form,
      displayName: formatPokeApiText(form.formName || form.name),
      spriteUrl: form.sprites.frontDefault ?? form.sprites.frontShiny,
    }));
  });

  readonly formatVarietyName = (name: string): string => formatPokeApiText(name);

  isCurrentSpecies(speciesName: string): boolean {
    const currentSpecies = this.pokemon().bundle?.species.name ?? this.pokemon().name;
    return speciesName.toLowerCase() === currentSpecies.toLowerCase();
  }

  onPickSpecies(name: string, isCurrent: boolean): void {
    if (isCurrent) return;
    this.selectPokemon.emit(name);
  }
}
