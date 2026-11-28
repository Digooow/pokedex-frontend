import {
  type CharacterAppearance,
  type CharacterAttributeAllocation,
  type CharacterAttributeKey,
  type CharacterOriginKey,
  type CharacterPresenceMode,
  type CharacterSheet,
  CharacterSheetSchema,
  type CharacterTrainingState,
  type CreateCharacterInput,
  CreateCharacterSchema,
  buildCharacterVitalsState,
  buildInitialAttributes,
  computeCharacterDerivedVitals,
  createInitialTrainingState,
  getCharacterOriginByKey,
  sanitizeCharacterDisplayName,
} from '@pokeverse/shared';

export const DEFAULT_CHARACTER_APPEARANCE: CharacterAppearance = {
  bodyModel: 'male',
  skinTone: 'ochre',
  hairStyle: 'short',
  hairColor: 'obsidian',
  outfitStyle: 'tunic',
  outfitColor: 'forest',
};

export const PRESENCE_MODE_LABELS: Readonly<Record<CharacterPresenceMode, string>> = {
  ONLINE: 'Online',
  OFFLINE_ROUTINE: 'Rotina Offline',
  OFFLINE_SHOP: 'Atendendo Loja',
  OFFLINE_GUARD: 'Em Posto de Guarda',
};

export function adjustAllocationPoint(params: {
  readonly current: CharacterAttributeAllocation;
  readonly key: CharacterAttributeKey;
  readonly delta: number;
  readonly remainingPool: number;
}): CharacterAttributeAllocation {
  const existing = params.current[params.key];
  if (params.delta < 0 && existing <= 0) {
    return params.current;
  }
  if (params.delta > 0 && params.remainingPool < params.delta) {
    return params.current;
  }
  const nextValue = existing + params.delta;
  if (nextValue < 0) {
    return params.current;
  }
  return {
    ...params.current,
    [params.key]: nextValue,
  };
}

export function buildVisitorPreviewSheet(params: {
  readonly name: string;
  readonly originKey: CharacterOriginKey;
  readonly appearance: CharacterAppearance;
  readonly allocation: CharacterAttributeAllocation;
}): CharacterSheet {
  const origin = getCharacterOriginByKey(params.originKey);
  const attributes = buildInitialAttributes(params.allocation);
  const vitals = computeCharacterDerivedVitals(1, attributes);
  const nowIso = new Date().toISOString();

  return CharacterSheetSchema.parse({
    id: '00000000-0000-4000-8000-000000000000',
    accountId: '00000000-0000-4000-8000-000000000001',
    name: params.name,
    originKey: origin.key,
    originLabel: origin.label,
    startingRegionName: origin.startingRegionName,
    classlessMode: true,
    appearance: params.appearance,
    level: 1,
    totalSkillMilestones: 0,
    availableAttributePoints: 0,
    hexQ: origin.startingHex.q,
    hexR: origin.startingHex.r,
    hexZ: origin.startingHex.z,
    presenceMode: 'ONLINE',
    attributes,
    vitals: buildCharacterVitalsState({ originKey: origin.key, derived: vitals }),
    starterKit: [...origin.starterKit],
    createdAt: nowIso,
    updatedAt: nowIso,
  });
}

export function validateCharacterDraftPayload(params: {
  readonly rawName: string;
  readonly originKey: CharacterOriginKey;
  readonly appearance: CharacterAppearance;
  readonly initialAttributes: CharacterAttributeAllocation;
  readonly requireName: boolean;
}):
  | { readonly valid: true; readonly payload: CreateCharacterInput }
  | { readonly valid: false; readonly message: string } {
  const cleanName = sanitizeCharacterDisplayName(params.rawName);
  const effectiveName = cleanName || (params.requireName ? '' : 'Viajante');
  const result = CreateCharacterSchema.safeParse({
    name: effectiveName,
    originKey: params.originKey,
    appearance: params.appearance,
    initialAttributes: params.initialAttributes,
  });
  if (!result.success) {
    return {
      valid: false,
      message: result.error.issues[0]?.message ?? 'Verifique os dados do personagem.',
    };
  }
  return { valid: true, payload: result.data };
}

export function extractTopTrainedSkills(
  training: CharacterTrainingState,
  skillLabels: ReadonlyMap<string, string>,
): readonly string[] {
  const ranked = Object.entries(training.skills)
    .filter(([, entry]) => entry.rank > 0 || entry.xp > 0)
    .sort(([, a], [, b]) => b.rank * 1000 + b.xp - (a.rank * 1000 + a.xp))
    .slice(0, 3)
    .map(([id, entry]) => `${skillLabels.get(id) ?? id} (${entry.rank})`);
  return ranked.length > 0 ? ranked : ['Viajante Recém-Chegado (0)'];
}

export function resolveSheetTrainingState(
  sheet: CharacterSheet | null,
  trainingMap: Readonly<Record<string, CharacterTrainingState>>,
): CharacterTrainingState | null {
  if (!sheet) return null;
  return (
    trainingMap[sheet.id] ??
    createInitialTrainingState(sheet.attributes, sheet.totalSkillMilestones)
  );
}

export function computeTrainingEffectiveVitals(
  sheet: CharacterSheet | null,
  training: CharacterTrainingState | null,
) {
  if (!sheet || !training) return null;
  return buildCharacterVitalsState({
    originKey: sheet.originKey,
    derived: computeCharacterDerivedVitals(1, training.attributes),
    current: sheet.vitals,
  });
}
