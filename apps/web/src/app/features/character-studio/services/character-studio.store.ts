import { Injectable, computed, inject, signal } from '@angular/core';
import {
  type AsyncState,
  CHARACTER_INITIAL_ATTRIBUTE_POOL,
  CHARACTER_INITIAL_PRESETS,
  CHARACTER_MAX_PER_ACCOUNT,
  type CharacterAppearance,
  type CharacterAttributeAllocation,
  type CharacterAttributeKey,
  type CharacterBodyModel,
  type CharacterOriginKey,
  type CharacterSheet,
  type CharacterTrainingState,
  DEFAULT_EMERGENT_ARCHETYPE,
  type SkillTrainingResult,
  ZERO_ATTRIBUTE_ALLOCATION,
  applySkillTrainingAction,
  buildInitialAttributes,
  computeCharacterDerivedVitals,
  computeStarterKitWeightKg,
  createInitialTrainingState,
  getCharacterOriginByKey,
  sumAttributeAllocation,
} from '@pokeverse/shared';
import { extractApiErrorMessage } from '../../../core/http/api-error.util';
import { AuthStore } from '../../../core/stores/auth.store';
import { CharacterApiClient } from './character-api.client';
import {
  DEFAULT_CHARACTER_APPEARANCE,
  adjustAllocationPoint,
  buildVisitorPreviewSheet,
  computeTrainingEffectiveVitals,
  resolveSheetTrainingState,
  validateCharacterDraftPayload,
} from './character-studio.constants';

export type CharacterStudioTab = 'create' | 'sheet' | 'bazaar';

export type CharacterMutationState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'success'; readonly message: string };

const DEFAULT_PRESET_ALLOCATION: CharacterAttributeAllocation = CHARACTER_INITIAL_PRESETS[0]
  ?.allocation ?? { ...ZERO_ATTRIBUTE_ALLOCATION };

@Injectable({ providedIn: 'root' })
export class CharacterStudioStore {
  private readonly api = inject(CharacterApiClient);
  private readonly auth = inject(AuthStore);

  private readonly charactersSignal = signal<AsyncState<readonly CharacterSheet[]>>({
    status: 'idle',
  });
  private readonly selectedIdSignal = signal<string | null>(null);
  private readonly activeTabSignal = signal<CharacterStudioTab>('create');
  private readonly mutationSignal = signal<CharacterMutationState>({ status: 'idle' });
  private readonly visitorPreviewSignal = signal<CharacterSheet | null>(null);
  private readonly trainingMapSignal = signal<Readonly<Record<string, CharacterTrainingState>>>({});
  private readonly lastTrainingSignal = signal<SkillTrainingResult | null>(null);

  private readonly draftNameSignal = signal('');
  private readonly draftOriginSignal = signal<CharacterOriginKey>('settler');
  private readonly draftAppearanceSignal = signal<CharacterAppearance>(
    DEFAULT_CHARACTER_APPEARANCE,
  );
  private readonly draftAllocationSignal = signal<CharacterAttributeAllocation>({
    ...DEFAULT_PRESET_ALLOCATION,
  });

  readonly charactersState = this.charactersSignal.asReadonly();
  readonly selectedCharacterId = this.selectedIdSignal.asReadonly();
  readonly activeTab = this.activeTabSignal.asReadonly();
  readonly mutationState = this.mutationSignal.asReadonly();
  readonly draftName = this.draftNameSignal.asReadonly();
  readonly draftOriginKey = this.draftOriginSignal.asReadonly();
  readonly draftAppearance = this.draftAppearanceSignal.asReadonly();
  readonly draftAllocation = this.draftAllocationSignal.asReadonly();
  readonly lastTrainingResult = this.lastTrainingSignal.asReadonly();

  readonly isSubmitting = computed(() => this.mutationSignal().status === 'submitting');
  readonly savedCharacters = computed<readonly CharacterSheet[]>(() => {
    const state = this.charactersSignal();
    return state.status === 'success' ? state.data : [];
  });
  readonly loadErrorMessage = computed<string | null>(() => {
    const state = this.charactersSignal();
    return state.status === 'error' ? state.error.message : null;
  });
  readonly canCreateMore = computed(
    () => this.savedCharacters().length < CHARACTER_MAX_PER_ACCOUNT,
  );
  readonly remainingInitialPoints = computed(
    () => CHARACTER_INITIAL_ATTRIBUTE_POOL - sumAttributeAllocation(this.draftAllocationSignal()),
  );
  readonly draftAttributes = computed(() => buildInitialAttributes(this.draftAllocationSignal()));
  readonly draftVitals = computed(() => computeCharacterDerivedVitals(1, this.draftAttributes()));
  readonly draftOrigin = computed(() => getCharacterOriginByKey(this.draftOriginSignal()));
  readonly draftStarterKitWeightKg = computed(() =>
    computeStarterKitWeightKg(this.draftOriginSignal()),
  );

  readonly activeSheet = computed<CharacterSheet | null>(() => {
    if (!this.auth.isAuthenticated()) return this.visitorPreviewSignal();
    const list = this.savedCharacters();
    if (list.length === 0) return null;
    const selectedId = this.selectedIdSignal();
    return list.find((item) => item.id === selectedId) ?? list[0] ?? null;
  });

  readonly isShowingPreview = computed(
    () => !this.auth.isAuthenticated() && this.visitorPreviewSignal() !== null,
  );

  readonly activeTrainingState = computed<CharacterTrainingState | null>(() =>
    resolveSheetTrainingState(this.activeSheet(), this.trainingMapSignal()),
  );

  readonly activeEffectiveAttributes = computed(
    () =>
      this.activeTrainingState()?.attributes ??
      this.activeSheet()?.attributes ??
      this.draftAttributes(),
  );

  readonly activeEffectiveVitals = computed(() =>
    computeTrainingEffectiveVitals(this.activeSheet(), this.activeTrainingState()),
  );

  readonly activeEmergentArchetype = computed(
    () => this.activeTrainingState()?.emergentArchetype ?? DEFAULT_EMERGENT_ARCHETYPE,
  );

  loadCharacters(): void {
    if (!this.auth.isAuthenticated()) {
      this.charactersSignal.set({ status: 'idle' });
      return;
    }
    this.charactersSignal.set({ status: 'loading' });
    this.api.listCharacters(20, 0).subscribe({
      next: (res) => {
        this.charactersSignal.set({ status: 'success', data: res.items });
        const first = res.items[0];
        this.selectedIdSignal.set(first ? first.id : null);
        this.activeTabSignal.set(first ? 'sheet' : 'create');
      },
      error: (err: unknown) => {
        this.charactersSignal.set({
          status: 'error',
          error: {
            code: 'CHARACTER_LOAD_FAILED',
            message: extractApiErrorMessage(err, 'Não foi possível carregar seus personagens.'),
            retryable: true,
          },
        });
      },
    });
  }

  setDraftName(name: string): void {
    this.draftNameSignal.set(name);
    this.clearFeedback();
  }

  setDraftOrigin(originKey: CharacterOriginKey): void {
    this.draftOriginSignal.set(originKey);
    this.clearFeedback();
  }

  setDraftBodyModel(bodyModel: CharacterBodyModel): void {
    this.draftAppearanceSignal.update((current) => ({ ...current, bodyModel }));
    this.clearFeedback();
  }

  updateAppearance(patch: Partial<CharacterAppearance>): void {
    this.draftAppearanceSignal.update((current) => ({ ...current, ...patch }));
    this.clearFeedback();
  }

  adjustInitialPoint(key: CharacterAttributeKey, delta: number): void {
    this.draftAllocationSignal.update((current) =>
      adjustAllocationPoint({
        current,
        key,
        delta,
        remainingPool: this.remainingInitialPoints(),
      }),
    );
    this.clearFeedback();
  }

  applyInitialPreset(presetKey: 'balanced' | 'vanguard' | 'arcanist'): void {
    const preset = CHARACTER_INITIAL_PRESETS.find((item) => item.key === presetKey);
    if (!preset) return;
    this.draftAllocationSignal.set({ ...preset.allocation });
    this.clearFeedback();
  }

  resetInitialAllocation(): void {
    this.draftAllocationSignal.set({ ...ZERO_ATTRIBUTE_ALLOCATION });
    this.clearFeedback();
  }

  openCreateTab(): void {
    this.activeTabSignal.set('create');
    this.clearFeedback();
  }

  openSheetTab(): void {
    const current = this.activeSheet();
    if (current) {
      this.selectedIdSignal.set(current.id);
      this.activeTabSignal.set('sheet');
      this.clearFeedback();
      return;
    }
    this.openVisitorPreview();
  }

  openBazaarTab(): void {
    this.activeTabSignal.set('bazaar');
    this.clearFeedback();
  }

  selectCharacter(characterId: string): void {
    this.selectedIdSignal.set(characterId);
    this.activeTabSignal.set('sheet');
    this.lastTrainingSignal.set(null);
    this.clearFeedback();
  }

  trainSkill(skillId: string): void {
    const sheet = this.activeSheet();
    const current = this.activeTrainingState();
    if (!sheet || !current) return;
    const result = applySkillTrainingAction(current, skillId, 32);
    this.trainingMapSignal.update((map) => ({ ...map, [sheet.id]: result.nextState }));
    this.lastTrainingSignal.set(result);
  }

  openVisitorPreview(): void {
    const parsed = this.validateDraft(false);
    if (!parsed.valid) {
      this.mutationSignal.set({ status: 'error', message: parsed.message });
      return;
    }
    this.visitorPreviewSignal.set(
      buildVisitorPreviewSheet({
        ...parsed.payload,
        allocation: parsed.payload.initialAttributes,
      }),
    );
    this.activeTabSignal.set('sheet');
    this.clearFeedback();
  }

  submitCreate(): void {
    if (this.isSubmitting()) return;
    if (!this.auth.isAuthenticated()) {
      this.auth.requestTrainerAccess(
        'Salvar Personagem na Conta',
        'Entre ou crie sua conta para gravar seu personagem no PostgreSQL. Seu rascunho atual será preservado.',
        '/personagem',
      );
      return;
    }
    const parsed = this.validateDraft(true);
    if (!parsed.valid) {
      this.mutationSignal.set({ status: 'error', message: parsed.message });
      return;
    }
    this.mutationSignal.set({ status: 'submitting' });
    this.api.createCharacter(parsed.payload).subscribe({
      next: (created) => {
        this.charactersSignal.set({
          status: 'success',
          data: [created, ...this.savedCharacters()],
        });
        this.selectedIdSignal.set(created.id);
        this.activeTabSignal.set('sheet');
        this.draftNameSignal.set('');
        this.mutationSignal.set({
          status: 'success',
          message: `${created.name} criado sem classe fixa e pronto para treinar!`,
        });
      },
      error: (err: unknown) => this.setMutationError(err, 'Não foi possível criar o personagem.'),
    });
  }

  allocatePoints(characterId: string, allocations: CharacterAttributeAllocation): void {
    if (this.isSubmitting()) return;
    this.mutationSignal.set({ status: 'submitting' });
    this.api.allocateAttributes(characterId, { allocations }).subscribe({
      next: (updated) => {
        const replaced = this.savedCharacters().map((item) =>
          item.id === updated.id ? updated : item,
        );
        this.charactersSignal.set({ status: 'success', data: replaced });
        this.selectedIdSignal.set(updated.id);
        this.trainingMapSignal.update((map) => ({
          ...map,
          [updated.id]: createInitialTrainingState(
            updated.attributes,
            updated.totalSkillMilestones,
          ),
        }));
        this.mutationSignal.set({ status: 'success', message: 'Pontos alocados com sucesso.' });
      },
      error: (err: unknown) => this.setMutationError(err, 'Não foi possível alocar os pontos.'),
    });
  }

  clearFeedback(): void {
    const status = this.mutationSignal().status;
    if (status === 'error' || status === 'success') this.mutationSignal.set({ status: 'idle' });
  }

  private validateDraft(requireName: boolean) {
    return validateCharacterDraftPayload({
      rawName: this.draftNameSignal(),
      originKey: this.draftOriginSignal(),
      appearance: this.draftAppearanceSignal(),
      initialAttributes: this.draftAllocationSignal(),
      requireName,
    });
  }

  private setMutationError(err: unknown, fallback: string): void {
    this.mutationSignal.set({ status: 'error', message: extractApiErrorMessage(err, fallback) });
  }
}
