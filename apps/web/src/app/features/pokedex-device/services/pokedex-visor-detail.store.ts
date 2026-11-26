import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import type {
  AsyncState,
  CachedPokemonEncountersResponse,
  CachedPokemonFormsResponse,
} from '@pokeverse/shared';
import type { AbilityDetail, MoveDetail } from '@pokeverse/shared/pokedex-encyclopedia';
import { Subscription } from 'rxjs';
import { AudioEngineService } from '../../../core/audio/audio-engine.service';
import { AudioStore, type CryPlaybackKind } from '../../../core/stores/audio.store';
import { PokedexApiClient } from './pokedex-api.client';
import {
  VISOR_MODES,
  VISOR_TABS,
  type VisorModeId,
  type VisorSpriteMode,
  type VisorTabId,
} from './pokedex-visor-format.util';

@Injectable({ providedIn: 'root' })
export class PokedexVisorDetailStore implements OnDestroy {
  private readonly apiClient = inject(PokedexApiClient);
  private readonly audioStore = inject(AudioStore);
  private readonly audioEngine = inject(AudioEngineService);

  private readonly formsCache = new Map<string, CachedPokemonFormsResponse>();
  private readonly encountersCache = new Map<string, CachedPokemonEncountersResponse>();
  private readonly moveCache = new Map<string, MoveDetail>();
  private readonly abilityCache = new Map<string, AbilityDetail>();

  private formsSub: Subscription | null = null;
  private encountersSub: Subscription | null = null;
  private readonly moveSubs = new Map<string, Subscription>();
  private readonly abilitySubs = new Map<string, Subscription>();
  private currentPokemonName: string | null = null;

  readonly activeMode = signal<VisorModeId>('ficha');
  readonly activeTab = signal<VisorTabId>('resumo');
  readonly expanded = signal(false);
  readonly spriteMode = signal<VisorSpriteMode>('artwork');
  readonly shiny = signal(false);
  readonly playingCry = this.audioStore.activeCryKind;
  readonly cryError = this.audioStore.cryError;
  readonly formsState = signal<AsyncState<CachedPokemonFormsResponse>>({ status: 'idle' });
  readonly encountersState = signal<AsyncState<CachedPokemonEncountersResponse>>({
    status: 'idle',
  });
  readonly moveDetails = signal<Readonly<Record<string, AsyncState<MoveDetail>>>>({});
  readonly abilityDetails = signal<Readonly<Record<string, AsyncState<AbilityDetail>>>>({});

  setMode(mode: VisorModeId): void {
    if (VISOR_MODES.some((entry) => entry.id === mode)) {
      this.activeMode.set(mode);
    }
  }

  setExpanded(value: boolean): void {
    this.expanded.set(value);
  }

  toggleExpanded(): void {
    this.expanded.update((prev) => !prev);
  }

  collapseIfExpanded(): boolean {
    if (!this.expanded()) return false;
    this.expanded.set(false);
    return true;
  }

  resetForPokemon(pokemonName: string | null): void {
    const normalized = pokemonName?.trim().toLowerCase() ?? null;
    if (normalized === this.currentPokemonName && normalized !== null) return;

    this.currentPokemonName = normalized;
    this.formsSub?.unsubscribe();
    this.encountersSub?.unsubscribe();
    this.stopCry();
    this.activeTab.set('resumo');
    this.spriteMode.set('artwork');
    this.shiny.set(false);
    this.formsState.set({ status: 'idle' });
    this.encountersState.set({ status: 'idle' });
  }

  selectTab(tab: VisorTabId, pokemonName: string | null): void {
    this.activeTab.set(tab);
    if (!pokemonName) return;
    if (tab === 'evolucao') this.ensureFormsLoaded(pokemonName);
    if (tab === 'mapa') this.ensureEncountersLoaded(pokemonName);
  }

  stepTab(delta: -1 | 1, pokemonName: string | null): void {
    const idx = VISOR_TABS.findIndex((entry) => entry.id === this.activeTab());
    const safeIdx = Math.max(idx, 0);
    const nextIdx = (safeIdx + delta + VISOR_TABS.length) % VISOR_TABS.length;
    const target = VISOR_TABS[nextIdx];
    if (target) this.selectTab(target.id, pokemonName);
  }

  toggleShiny(): void {
    this.shiny.update((prev) => !prev);
  }

  setSpriteMode(mode: VisorSpriteMode): void {
    this.spriteMode.set(mode);
  }

  playCry(kind: CryPlaybackKind, url: string | null): void {
    this.audioEngine.playCry(kind, url);
  }

  stopCry(): void {
    this.audioEngine.stopCry();
  }

  ensureFormsLoaded(pokemonName: string, force = false): void {
    const key = pokemonName.trim().toLowerCase();
    if (!key) return;
    const cached = !force ? this.formsCache.get(key) : undefined;
    if (cached) {
      this.formsState.set({ status: 'success', data: cached });
      return;
    }
    if (!force && this.formsState().status === 'loading') return;

    this.formsSub?.unsubscribe();
    this.formsState.set({ status: 'loading' });
    this.formsSub = this.apiClient.fetchPokemonForms(key).subscribe((res) => {
      if (!res) {
        this.formsState.set({
          status: 'error',
          error: {
            code: 'FORMS_UNAVAILABLE',
            message: 'Não foi possível carregar as formas alternativas agora.',
            retryable: true,
          },
        });
        return;
      }
      this.formsCache.set(key, res);
      if (this.currentPokemonName === key || this.currentPokemonName === null) {
        this.formsState.set({ status: 'success', data: res });
      }
    });
  }

  ensureEncountersLoaded(pokemonName: string, force = false): void {
    const key = pokemonName.trim().toLowerCase();
    if (!key) return;
    const cached = !force ? this.encountersCache.get(key) : undefined;
    if (cached) {
      this.encountersState.set(
        cached.encounters.length > 0
          ? { status: 'success', data: cached }
          : { status: 'empty', reason: 'Nenhum encontro selvagem registrado na PokéAPI.' },
      );
      return;
    }
    if (!force && this.encountersState().status === 'loading') return;

    this.encountersSub?.unsubscribe();
    this.encountersState.set({ status: 'loading' });
    this.encountersSub = this.apiClient.fetchPokemonEncounters(key).subscribe((res) => {
      if (!res) {
        this.encountersState.set({
          status: 'error',
          error: {
            code: 'ENCOUNTERS_UNAVAILABLE',
            message: 'Não foi possível consultar os habitats de captura agora.',
            retryable: true,
          },
        });
        return;
      }
      this.encountersCache.set(key, res);
      if (this.currentPokemonName === key || this.currentPokemonName === null) {
        this.encountersState.set(
          res.encounters.length > 0
            ? { status: 'success', data: res }
            : { status: 'empty', reason: 'Nenhum encontro selvagem registrado na PokéAPI.' },
        );
      }
    });
  }

  loadMoveDetail(moveName: string, force = false): void {
    const key = moveName.trim().toLowerCase();
    if (!key) return;
    const cached = !force ? this.moveCache.get(key) : undefined;
    if (cached) {
      this.patchMoveState(key, { status: 'success', data: cached });
      return;
    }
    if (!force && this.moveDetails()[key]?.status === 'loading') return;

    this.moveSubs.get(key)?.unsubscribe();
    this.patchMoveState(key, { status: 'loading' });
    const sub = this.apiClient.fetchMoveDetail(key).subscribe((move) => {
      if (!move) {
        this.patchMoveState(key, {
          status: 'error',
          error: {
            code: 'MOVE_UNAVAILABLE',
            message: 'Não foi possível carregar os dados do golpe.',
            retryable: true,
          },
        });
        return;
      }
      this.moveCache.set(key, move);
      this.patchMoveState(key, { status: 'success', data: move });
    });
    this.moveSubs.set(key, sub);
  }

  loadAbilityDetail(abilityName: string, force = false): void {
    const key = abilityName.trim().toLowerCase();
    if (!key) return;
    const cached = !force ? this.abilityCache.get(key) : undefined;
    if (cached) {
      this.patchAbilityState(key, { status: 'success', data: cached });
      return;
    }
    if (!force && this.abilityDetails()[key]?.status === 'loading') return;

    this.abilitySubs.get(key)?.unsubscribe();
    this.patchAbilityState(key, { status: 'loading' });
    const sub = this.apiClient.fetchAbilityDetail(key).subscribe((ability) => {
      if (!ability) {
        this.patchAbilityState(key, {
          status: 'error',
          error: {
            code: 'ABILITY_UNAVAILABLE',
            message: 'Não foi possível carregar a descrição da habilidade.',
            retryable: true,
          },
        });
        return;
      }
      this.abilityCache.set(key, ability);
      this.patchAbilityState(key, { status: 'success', data: ability });
    });
    this.abilitySubs.set(key, sub);
  }

  ngOnDestroy(): void {
    this.expanded.set(false);
    this.formsSub?.unsubscribe();
    this.encountersSub?.unsubscribe();
    this.moveSubs.forEach((sub) => sub.unsubscribe());
    this.abilitySubs.forEach((sub) => sub.unsubscribe());
    this.stopCry();
  }

  private patchMoveState(key: string, state: AsyncState<MoveDetail>): void {
    this.moveDetails.update((prev) => ({ ...prev, [key]: state }));
  }

  private patchAbilityState(key: string, state: AsyncState<AbilityDetail>): void {
    this.abilityDetails.update((prev) => ({ ...prev, [key]: state }));
  }
}
