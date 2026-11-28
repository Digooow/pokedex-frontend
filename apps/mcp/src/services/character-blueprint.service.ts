import {
  CHARACTER_BODY_MODEL_META,
  CHARACTER_EMERGENT_ARCHETYPES,
  CHARACTER_INITIAL_PRESETS,
  CHARACTER_ORIGINS,
  CHARACTER_PROFESSION_GROUPS,
  CHARACTER_SKILL_NODES,
  type CharacterAttributeAllocation,
  type CharacterBodyModel,
  type CharacterOriginKey,
  ZERO_ATTRIBUTE_ALLOCATION,
  applySkillTrainingAction,
  buildInitialAttributes,
  computeCharacterDerivedVitals,
  createInitialTrainingState,
  getCharacterBodyModelMeta,
  getCharacterOriginByKey,
  sanitizeCharacterDisplayName,
} from '@pokeverse/shared';

export interface CharacterBlueprintInput {
  readonly name: string;
  readonly originKey: CharacterOriginKey;
  readonly bodyModel: CharacterBodyModel;
  readonly presetKey: 'balanced' | 'vanguard' | 'arcanist';
  readonly trainSkills?: readonly string[];
}

export function buildCharacterBlueprint(input: CharacterBlueprintInput) {
  const safeName = sanitizeCharacterDisplayName(input.name);
  const origin = getCharacterOriginByKey(input.originKey);
  const bodyMeta = getCharacterBodyModelMeta(input.bodyModel);
  const preset =
    CHARACTER_INITIAL_PRESETS.find((item) => item.key === input.presetKey) ??
    CHARACTER_INITIAL_PRESETS[0];
  const allocation: CharacterAttributeAllocation = preset?.allocation ?? ZERO_ATTRIBUTE_ALLOCATION;
  const baseAttributes = buildInitialAttributes(allocation);

  let trainingState = createInitialTrainingState(baseAttributes, 0);
  const trainingTrace: Array<{
    readonly skillId: string;
    readonly chainModifier: number;
    readonly gainedRanks: number;
  }> = [];

  for (const skillId of input.trainSkills ?? []) {
    const result = applySkillTrainingAction(trainingState, skillId);
    trainingState = result.nextState;
    const gainedRanks = result.skillGains.reduce((sum, item) => sum + item.ranksGained, 0);
    trainingTrace.push({
      skillId: result.trainedSkillId,
      chainModifier: result.chainModifier,
      gainedRanks,
    });
  }

  const derivedVitals = computeCharacterDerivedVitals(1, trainingState.attributes);
  return {
    name: safeName,
    origin,
    bodyModel: bodyMeta,
    presetKey: preset?.key ?? 'balanced',
    attributes: trainingState.attributes,
    derivedVitals,
    emergentArchetype: trainingState.emergentArchetype,
    totalTrainingActions: trainingState.totalTrainingActions,
    totalMilestones: trainingState.totalMilestones,
    trainingTrace,
    babylonRigContract: {
      glbAssetPath: bodyMeta.modelUrl,
      physicsCapsuleRadiusM: 0.35,
      physicsCapsuleHeightM: 1.75,
      suggestedMassKg: 72,
    },
  };
}

export function getCharacterDevkitCatalog() {
  return {
    origins: CHARACTER_ORIGINS,
    bodyModels: CHARACTER_BODY_MODEL_META,
    initialPresets: CHARACTER_INITIAL_PRESETS,
    emergentArchetypes: CHARACTER_EMERGENT_ARCHETYPES,
    professionGroups: CHARACTER_PROFESSION_GROUPS,
    trainableSkillCount: CHARACTER_SKILL_NODES.filter((node) => node.trainable).length,
    skillNodes: CHARACTER_SKILL_NODES,
  };
}
