import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import {
  type AsyncState,
  type BattleWeather,
  type CalculatedStatsResult,
  type MoveCategory,
  POKEMON_TYPES,
  type PokemonTypeName,
  formatPokeApiText,
} from '@pokeverse/shared';
import { Subscription } from 'rxjs';
import { resolvePokemonTypeSlug } from '../../../../shared/utils/pokemon-type-style.util';
import { PokedexApiClient } from '../../services/pokedex-api.client';
import {
  DAMAGE_STAGE_OPTIONS,
  DEFENDER_PRESETS,
  type DamageItemMultiplier,
  type DefenderPresetId,
  clampNumericInputEvent,
  computeDamageSimulation,
  computeDefenderStats,
  extractLearnedMoveOptions,
  resolveEffectivenessVariant,
  resolveLearnedMovePatch,
} from '../../services/pokedex-damage-sim.util';
import {
  buildQuickCatalogSuggestions,
  extractPokemonTypeSlugs,
} from '../../services/pokedex-stat-calc.util';
import {
  type PokemonDetailView,
  mapResolvedResultToAsyncState,
} from '../../services/pokedex-view-mapper.util';
import { PokedexStore } from '../../services/pokedex.store';

@Component({
  selector: 'pv-pokedex-damage-sim-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pokedex-damage-sim-panel.component.html',
  styleUrl: './pokedex-damage-sim-panel.component.scss',
})
export class PokedexDamageSimPanelComponent implements OnDestroy {
  private readonly pokedex = inject(PokedexStore);
  private readonly apiClient = inject(PokedexApiClient);

  readonly attacker = input.required<PokemonDetailView>();
  readonly attackerLevel = input.required<number>();
  readonly attackerStats = input.required<CalculatedStatsResult>();

  readonly pokemonTypes = POKEMON_TYPES;
  readonly defenderPresets = DEFENDER_PRESETS;
  readonly stageOptions = DAMAGE_STAGE_OPTIONS;
  readonly typeSlug = resolvePokemonTypeSlug;
  readonly formatLabel = (raw: string) => formatPokeApiText(raw);
  readonly effectivenessVariant = resolveEffectivenessVariant;

  readonly defenderQuery = signal('');
  readonly defenderState = signal<AsyncState<PokemonDetailView>>({
    status: 'empty',
    reason: 'Escolha um Pokémon defensor para simular dano real com STAB e eficácia.',
  });
  readonly defenderLevel = signal(50);
  readonly defenderPreset = signal<DefenderPresetId>('neutral');
  readonly selectedMoveName = signal('');
  readonly moveType = signal<PokemonTypeName>('normal');
  readonly moveCategory = signal<MoveCategory>('physical');
  readonly movePower = signal(80);
  readonly attackerStage = signal(0);
  readonly weather = signal<BattleWeather>('none');
  readonly itemMultiplier = signal<DamageItemMultiplier>(1);
  readonly isCritical = signal(false);
  readonly isBurned = signal(false);
  readonly isDoublesSpread = signal(false);
  readonly loadingMove = signal(false);

  private lastDefenderTerm = '';
  private defenderSub: Subscription | null = null;
  private moveSub: Subscription | null = null;

  readonly defenderSuggestions = computed(() =>
    buildQuickCatalogSuggestions(this.pokedex.catalogState(), this.defenderQuery()),
  );
  readonly learnedMoves = computed(() => extractLearnedMoveOptions(this.attacker()));
  readonly defenderPokemon = computed(() => {
    const def = this.defenderState();
    return def.status === 'success' ? def.data : null;
  });
  readonly defenderCalculatedStats = computed(() => {
    const def = this.defenderPokemon();
    return def ? computeDefenderStats(def, this.defenderLevel(), this.defenderPreset()) : null;
  });
  readonly damageResult = computed(() => {
    const def = this.defenderPokemon();
    const defStats = this.defenderCalculatedStats();
    if (!def || !defStats) return null;
    return computeDamageSimulation({
      attacker: this.attacker(),
      attackerLevel: this.attackerLevel(),
      attackerStats: this.attackerStats(),
      defender: def,
      defenderStats: defStats,
      movePower: this.movePower(),
      moveCategory: this.moveCategory(),
      moveType: this.moveType(),
      isCritical: this.isCritical(),
      weather: this.weather(),
      isBurned: this.isBurned(),
      isDoublesSpread: this.isDoublesSpread(),
      attackerStage: this.attackerStage(),
      defenderStage: 0,
      itemMultiplier: this.itemMultiplier(),
    });
  });
  readonly hpRemainPct = (dmgPct: number) => Math.max(0, Math.round(100 - dmgPct));

  constructor() {
    this.pokedex.ensureCatalogLoaded();
    effect(() => {
      const atk = this.attacker();
      untracked(() => {
        this.moveType.set(extractPokemonTypeSlugs(atk)[0] ?? 'normal');
        this.selectedMoveName.set('');
      });
    });
  }

  onDefenderInput = (e: Event) => this.defenderQuery.set((e.target as HTMLInputElement).value);
  onDefenderSubmit(event: Event): void {
    event.preventDefault();
    const term = this.defenderQuery().trim();
    if (term) this.loadDefender(term);
  }
  loadDefender(idOrName: string): void {
    const clean = idOrName.trim().toLowerCase();
    if (!clean) return;
    this.lastDefenderTerm = clean;
    this.defenderQuery.set(clean);
    this.defenderSub?.unsubscribe();
    this.defenderState.set({ status: 'loading' });
    this.defenderSub = this.apiClient.fetchPokemonBundle(clean).subscribe((resolved) => {
      this.defenderState.set(mapResolvedResultToAsyncState(resolved, clean));
    });
  }
  retryDefender = () => {
    if (this.lastDefenderTerm) this.loadDefender(this.lastDefenderTerm);
  };
  onLearnedMoveSelect(event: Event): void {
    const moveName = (event.target as HTMLSelectElement).value;
    this.selectedMoveName.set(moveName);
    if (!moveName) return;
    this.moveSub?.unsubscribe();
    this.loadingMove.set(true);
    this.moveSub = this.apiClient.fetchMoveDetail(moveName).subscribe((move) => {
      this.loadingMove.set(false);
      if (!move) return;
      const patch = resolveLearnedMovePatch(move);
      if (patch.type) this.moveType.set(patch.type);
      if (patch.category) this.moveCategory.set(patch.category);
      if (patch.power !== null) this.movePower.set(patch.power);
    });
  }
  onNumericField(field: 'power' | 'defLevel' | 'atkStage' | 'item', event: Event): void {
    if (field === 'power') {
      const val = clampNumericInputEvent(event, 1, 250);
      if (val !== null) this.movePower.set(val);
      return;
    }
    if (field === 'defLevel') {
      const val = clampNumericInputEvent(event, 1, 100);
      if (val !== null) this.defenderLevel.set(val);
      return;
    }
    const raw = Number((event.target as HTMLSelectElement).value);
    if (field === 'atkStage' && Number.isFinite(raw)) this.attackerStage.set(raw);
    else if (field === 'item' && [1, 1.1, 1.2, 1.3, 1.5].includes(raw)) {
      this.itemMultiplier.set(raw as DamageItemMultiplier);
    }
  }
  onSelectField(
    field: 'moveType' | 'moveCategory' | 'weather' | 'defenderPreset',
    event: Event,
  ): void {
    const val = (event.target as HTMLSelectElement).value;
    if (field === 'moveType') this.moveType.set(val as PokemonTypeName);
    else if (field === 'moveCategory') this.moveCategory.set(val as MoveCategory);
    else if (field === 'weather') this.weather.set(val as BattleWeather);
    else this.defenderPreset.set(val as DefenderPresetId);
  }
  ngOnDestroy(): void {
    this.defenderSub?.unsubscribe();
    this.moveSub?.unsubscribe();
  }
}
