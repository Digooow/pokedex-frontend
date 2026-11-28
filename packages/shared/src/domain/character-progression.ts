import { type CharacterAttributeKey, type CharacterAttributes } from './character-presets';
import { type CharacterDerivedVitals, computeCharacterDerivedVitals } from './character-rules';
import {
  CHARACTER_EMERGENT_ARCHETYPES,
  CHARACTER_SKILL_NODES,
  type CharacterEmergentArchetype,
  type CharacterSkillNode,
  DEFAULT_EMERGENT_ARCHETYPE,
  SKILL_CASCADE_RATIOS,
} from './character-skill-catalog';

export * from './character-skill-catalog';

export interface SkillProgressEntry {
  readonly rank: number;
  readonly xp: number;
  readonly xpToNext: number;
}

export interface AttributeTrainingBar {
  readonly xp: number;
  readonly xpToNext: number;
}

export interface CharacterTrainingState {
  readonly attributes: CharacterAttributes;
  readonly attributeBars: Readonly<Record<CharacterAttributeKey, AttributeTrainingBar>>;
  readonly skills: Readonly<Record<string, SkillProgressEntry>>;
  readonly totalTrainingActions: number;
  readonly totalMilestones: number;
  readonly emergentArchetype: CharacterEmergentArchetype;
}

export interface SkillCascadeGain {
  readonly skillId: string;
  readonly label: string;
  readonly xpAdded: number;
  readonly ranksGained: number;
  readonly newRank: number;
}

export interface AttributeTrainingGain {
  readonly attributeKey: CharacterAttributeKey;
  readonly xpAdded: number;
  readonly pointsGained: number;
  readonly newValue: number;
}

export interface SkillTrainingResult {
  readonly nextState: CharacterTrainingState;
  readonly derivedVitals: CharacterDerivedVitals;
  readonly trainedSkillId: string;
  readonly trainedSkillLabel: string;
  readonly baseXp: number;
  readonly chainModifier: number;
  readonly skillGains: readonly SkillCascadeGain[];
  readonly attributeGains: readonly AttributeTrainingGain[];
}

const SKILL_BY_ID = new Map<string, CharacterSkillNode>(
  CHARACTER_SKILL_NODES.map((node) => [node.id, node]),
);

export function xpRequiredForSkillRank(rank: number): number {
  return Math.round(40 * (rank + 1) * (1 + rank * 0.12));
}

export function xpRequiredForAttributeTraining(currentValue: number): number {
  return 100 + currentValue * 25;
}

export function getSkillNodeById(skillId: string): CharacterSkillNode | undefined {
  return SKILL_BY_ID.get(skillId);
}

export function getSkillAncestorChain(skillId: string): readonly CharacterSkillNode[] {
  const chain: CharacterSkillNode[] = [];
  let current = SKILL_BY_ID.get(skillId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    chain.push(current);
    visited.add(current.id);
    current = current.parentId ? SKILL_BY_ID.get(current.parentId) : undefined;
  }
  return chain;
}

export function computeSkillChainModifier(
  skillId: string,
  skills: Readonly<Record<string, SkillProgressEntry>>,
): number {
  const chain = getSkillAncestorChain(skillId);
  let bonus = 0;
  for (const node of chain) {
    const rank = skills[node.id]?.rank ?? 0;
    if (rank > 0) {
      bonus += node.weight * (rank / (rank + node.halfScaleK));
    }
  }
  return Number((1 + bonus).toFixed(2));
}

export function resolveEmergentArchetype(
  skills: Readonly<Record<string, SkillProgressEntry>>,
): CharacterEmergentArchetype {
  let best = DEFAULT_EMERGENT_ARCHETYPE;
  let bestScore = 0;
  for (const archetype of CHARACTER_EMERGENT_ARCHETYPES) {
    let score = 0;
    for (const id of archetype.signatureSkills) {
      const entry = skills[id];
      score += (entry?.rank ?? 0) * 100 + (entry?.xp ?? 0);
    }
    if (score > bestScore) {
      bestScore = score;
      best = archetype;
    }
  }
  return best;
}

function buildAttributeBars(
  attributes: CharacterAttributes,
): Record<CharacterAttributeKey, AttributeTrainingBar> {
  return {
    physique: { xp: 0, xpToNext: xpRequiredForAttributeTraining(attributes.physique) },
    dexterity: { xp: 0, xpToNext: xpRequiredForAttributeTraining(attributes.dexterity) },
    stamina: { xp: 0, xpToNext: xpRequiredForAttributeTraining(attributes.stamina) },
    magic: { xp: 0, xpToNext: xpRequiredForAttributeTraining(attributes.magic) },
    perception: { xp: 0, xpToNext: xpRequiredForAttributeTraining(attributes.perception) },
    willpower: { xp: 0, xpToNext: xpRequiredForAttributeTraining(attributes.willpower) },
    handling: { xp: 0, xpToNext: xpRequiredForAttributeTraining(attributes.handling) },
  };
}

export function createInitialTrainingState(
  attributes: CharacterAttributes,
  initialMilestones = 0,
): CharacterTrainingState {
  const skills: Record<string, SkillProgressEntry> = {};
  for (const node of CHARACTER_SKILL_NODES) {
    skills[node.id] = { rank: 0, xp: 0, xpToNext: xpRequiredForSkillRank(0) };
  }
  return {
    attributes: { ...attributes },
    attributeBars: buildAttributeBars(attributes),
    skills,
    totalTrainingActions: 0,
    totalMilestones: initialMilestones,
    emergentArchetype: DEFAULT_EMERGENT_ARCHETYPE,
  };
}

function advanceSkillEntry(
  current: SkillProgressEntry,
  xpAdded: number,
): { readonly next: SkillProgressEntry; readonly ranksGained: number } {
  let rank = current.rank;
  let xp = current.xp + xpAdded;
  let xpToNext = current.xpToNext;
  let ranksGained = 0;
  while (xp >= xpToNext) {
    xp -= xpToNext;
    rank += 1;
    ranksGained += 1;
    xpToNext = xpRequiredForSkillRank(rank);
  }
  return { next: { rank, xp, xpToNext }, ranksGained };
}

function advanceAttributeByTraining(
  currentVal: number,
  bar: AttributeTrainingBar,
  xpAdded: number,
): {
  readonly nextVal: number;
  readonly nextBar: AttributeTrainingBar;
  readonly pointsGained: number;
} {
  let value = currentVal;
  let xp = bar.xp + xpAdded;
  let xpToNext = bar.xpToNext;
  let pointsGained = 0;
  while (xp >= xpToNext) {
    xp -= xpToNext;
    value += 1;
    pointsGained += 1;
    xpToNext = xpRequiredForAttributeTraining(value);
  }
  return { nextVal: value, nextBar: { xp, xpToNext }, pointsGained };
}

function applyCascadeXpToSkills(
  skills: Readonly<Record<string, SkillProgressEntry>>,
  skillId: string,
  baseXp: number,
) {
  const chain = getSkillAncestorChain(skillId);
  const nextSkills: Record<string, SkillProgressEntry> = { ...skills };
  const skillGains: SkillCascadeGain[] = [];
  let newMilestones = 0;

  for (let idx = 0; idx < chain.length; idx += 1) {
    const node = chain[idx];
    if (!node) continue;
    const ratio = SKILL_CASCADE_RATIOS[idx] ?? 0.1;
    const xpAdded = Math.max(1, Math.round(baseXp * ratio));
    const current = nextSkills[node.id] ?? { rank: 0, xp: 0, xpToNext: xpRequiredForSkillRank(0) };
    const { next, ranksGained } = advanceSkillEntry(current, xpAdded);
    nextSkills[node.id] = next;
    newMilestones += ranksGained;
    skillGains.push({
      skillId: node.id,
      label: node.label,
      xpAdded,
      ranksGained,
      newRank: next.rank,
    });
  }

  return { nextSkills, skillGains, newMilestones };
}

function applyAttributeTrainingGains(
  state: CharacterTrainingState,
  target: CharacterSkillNode,
  baseXp: number,
) {
  const nextAttrs: CharacterAttributes = { ...state.attributes };
  const nextBars: Record<CharacterAttributeKey, AttributeTrainingBar> = { ...state.attributeBars };
  const attrWeights: ReadonlyArray<readonly [CharacterAttributeKey, number]> =
    target.primaryAttr === target.secondaryAttr
      ? [[target.primaryAttr, Math.round(baseXp * 0.9)]]
      : [
          [target.primaryAttr, Math.round(baseXp * 0.65)],
          [target.secondaryAttr, Math.round(baseXp * 0.35)],
        ];

  const attributeGains: AttributeTrainingGain[] = attrWeights.map(([key, xpAdded]) => {
    const res = advanceAttributeByTraining(nextAttrs[key], nextBars[key], xpAdded);
    nextAttrs[key] = res.nextVal;
    nextBars[key] = res.nextBar;
    return { attributeKey: key, xpAdded, pointsGained: res.pointsGained, newValue: res.nextVal };
  });

  return { nextAttrs, nextBars, attributeGains };
}

export function applySkillTrainingAction(
  state: CharacterTrainingState,
  skillId: string,
  baseXp = 32,
): SkillTrainingResult {
  const target = SKILL_BY_ID.get(skillId);
  if (!target) {
    throw new Error(`Unknown skillId: ${skillId}`);
  }
  const { nextSkills, skillGains, newMilestones } = applyCascadeXpToSkills(
    state.skills,
    skillId,
    baseXp,
  );
  const { nextAttrs, nextBars, attributeGains } = applyAttributeTrainingGains(
    state,
    target,
    baseXp,
  );

  const nextState: CharacterTrainingState = {
    attributes: nextAttrs,
    attributeBars: nextBars,
    skills: nextSkills,
    totalTrainingActions: state.totalTrainingActions + 1,
    totalMilestones: state.totalMilestones + newMilestones,
    emergentArchetype: resolveEmergentArchetype(nextSkills),
  };

  return {
    nextState,
    derivedVitals: computeCharacterDerivedVitals(1, nextAttrs),
    trainedSkillId: target.id,
    trainedSkillLabel: target.label,
    baseXp,
    chainModifier: computeSkillChainModifier(target.id, nextSkills),
    skillGains,
    attributeGains,
  };
}
