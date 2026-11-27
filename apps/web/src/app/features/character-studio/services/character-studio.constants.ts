import {
  type CharacterAppearance,
  type CharacterAttributeAllocation,
  type CharacterAttributeKey,
  type CharacterHairColor,
  type CharacterHairStyle,
  type CharacterOriginKey,
  type CharacterOutfitColor,
  type CharacterOutfitStyle,
  type CharacterPresenceMode,
  type CharacterSheet,
  CharacterSheetSchema,
  type CharacterSkinTone,
  type CreateCharacterInput,
  CreateCharacterSchema,
  buildCharacterVitalsState,
  buildInitialAttributes,
  computeCharacterDerivedVitals,
  getCharacterOriginByKey,
  sanitizeCharacterDisplayName,
} from '@pokeverse/shared';

export interface LabeledOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export const SKIN_TONE_OPTIONS: readonly LabeledOption<CharacterSkinTone>[] = [
  { value: 'porcelain', label: 'Claro' },
  { value: 'sand', label: 'Areia' },
  { value: 'ochre', label: 'Ocre' },
  { value: 'bronze', label: 'Bronze' },
  { value: 'umber', label: 'Terra' },
  { value: 'ebony', label: 'Ébano' },
] as const;

export const HAIR_STYLE_OPTIONS: readonly LabeledOption<CharacterHairStyle>[] = [
  { value: 'short', label: 'Curto' },
  { value: 'long', label: 'Longo' },
  { value: 'braid', label: 'Trança' },
  { value: 'curly', label: 'Cacheado' },
  { value: 'hooded', label: 'Capuz' },
  { value: 'shaved', label: 'Raspado' },
] as const;

export const HAIR_COLOR_OPTIONS: readonly LabeledOption<CharacterHairColor>[] = [
  { value: 'obsidian', label: 'Obsidiana' },
  { value: 'chestnut', label: 'Castanho' },
  { value: 'copper', label: 'Cobre' },
  { value: 'wheat', label: 'Trigo' },
  { value: 'ash', label: 'Cinza' },
  { value: 'indigo', label: 'Índigo' },
] as const;

export const OUTFIT_STYLE_OPTIONS: readonly LabeledOption<CharacterOutfitStyle>[] = [
  { value: 'tunic', label: 'Túnica' },
  { value: 'cloak', label: 'Manto' },
  { value: 'apron', label: 'Avental' },
  { value: 'vest', label: 'Colete' },
] as const;

export const OUTFIT_COLOR_OPTIONS: readonly LabeledOption<CharacterOutfitColor>[] = [
  { value: 'forest', label: 'Floresta' },
  { value: 'slate', label: 'Ardósia' },
  { value: 'crimson', label: 'Carmesim' },
  { value: 'ochre', label: 'Mostarda' },
  { value: 'cobalt', label: 'Cobalto' },
  { value: 'linen', label: 'Linho' },
] as const;

export const DEFAULT_CHARACTER_APPEARANCE: CharacterAppearance = {
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
