import { MAX_EV_PER_STAT, MAX_EV_TOTAL } from '../constants/platform.constants';
import type { BaseStatsSpread } from './pokemon-lab';

export type StatSpreadKey = keyof BaseStatsSpread;

export interface PokemonNatureOption {
  readonly key: string;
  readonly label: string;
  readonly up: Exclude<StatSpreadKey, 'hp'> | null;
  readonly down: Exclude<StatSpreadKey, 'hp'> | null;
}

export const POKEMON_NATURES: readonly PokemonNatureOption[] = [
  { key: 'hardy', label: 'Hardy (Neutra)', up: null, down: null },
  { key: 'docile', label: 'Docile (Neutra)', up: null, down: null },
  { key: 'serious', label: 'Serious (Neutra)', up: null, down: null },
  { key: 'bashful', label: 'Bashful (Neutra)', up: null, down: null },
  { key: 'quirky', label: 'Quirky (Neutra)', up: null, down: null },
  { key: 'lonely', label: 'Lonely (+Atk, -Def)', up: 'attack', down: 'defense' },
  { key: 'brave', label: 'Brave (+Atk, -Spe)', up: 'attack', down: 'speed' },
  { key: 'adamant', label: 'Adamant (+Atk, -SpA)', up: 'attack', down: 'specialAttack' },
  { key: 'naughty', label: 'Naughty (+Atk, -SpD)', up: 'attack', down: 'specialDefense' },
  { key: 'bold', label: 'Bold (+Def, -Atk)', up: 'defense', down: 'attack' },
  { key: 'relaxed', label: 'Relaxed (+Def, -Spe)', up: 'defense', down: 'speed' },
  { key: 'impish', label: 'Impish (+Def, -SpA)', up: 'defense', down: 'specialAttack' },
  { key: 'lax', label: 'Lax (+Def, -SpD)', up: 'defense', down: 'specialDefense' },
  { key: 'timid', label: 'Timid (+Spe, -Atk)', up: 'speed', down: 'attack' },
  { key: 'hasty', label: 'Hasty (+Spe, -Def)', up: 'speed', down: 'defense' },
  { key: 'jolly', label: 'Jolly (+Spe, -SpA)', up: 'speed', down: 'specialAttack' },
  { key: 'naive', label: 'Naive (+Spe, -SpD)', up: 'speed', down: 'specialDefense' },
  { key: 'modest', label: 'Modest (+SpA, -Atk)', up: 'specialAttack', down: 'attack' },
  { key: 'mild', label: 'Mild (+SpA, -Def)', up: 'specialAttack', down: 'defense' },
  { key: 'quiet', label: 'Quiet (+SpA, -Spe)', up: 'specialAttack', down: 'speed' },
  { key: 'rash', label: 'Rash (+SpA, -SpD)', up: 'specialAttack', down: 'specialDefense' },
  { key: 'calm', label: 'Calm (+SpD, -Atk)', up: 'specialDefense', down: 'attack' },
  { key: 'gentle', label: 'Gentle (+SpD, -Def)', up: 'specialDefense', down: 'defense' },
  { key: 'sassy', label: 'Sassy (+SpD, -Spe)', up: 'specialDefense', down: 'speed' },
  { key: 'careful', label: 'Careful (+SpD, -SpA)', up: 'specialDefense', down: 'specialAttack' },
];

export interface CompetitiveSpreadPreset {
  readonly id: string;
  readonly label: string;
  readonly format: 'VGC' | 'Smogon OU';
  readonly level: number;
  readonly natureKey: string;
  readonly ivs: BaseStatsSpread;
  readonly evs: BaseStatsSpread;
}

const ALL_31_IVS: BaseStatsSpread = {
  hp: 31,
  attack: 31,
  defense: 31,
  specialAttack: 31,
  specialDefense: 31,
  speed: 31,
};

const ZERO_ATK_IVS: BaseStatsSpread = { ...ALL_31_IVS, attack: 0 };

function makeEvs(partial: Partial<BaseStatsSpread>): BaseStatsSpread {
  return {
    hp: 0,
    attack: 0,
    defense: 0,
    specialAttack: 0,
    specialDefense: 0,
    speed: 0,
    ...partial,
  };
}

export const COMPETITIVE_SPREAD_PRESETS: readonly CompetitiveSpreadPreset[] = [
  {
    id: 'vgc-fast-physical',
    label: 'VGC · Fast Sweeper Físico (Nv.50)',
    format: 'VGC',
    level: 50,
    natureKey: 'jolly',
    ivs: ALL_31_IVS,
    evs: makeEvs({ hp: 4, attack: 252, speed: 252 }),
  },
  {
    id: 'vgc-fast-special',
    label: 'VGC · Fast Sweeper Especial (Nv.50)',
    format: 'VGC',
    level: 50,
    natureKey: 'timid',
    ivs: ZERO_ATK_IVS,
    evs: makeEvs({ hp: 4, specialAttack: 252, speed: 252 }),
  },
  {
    id: 'vgc-bulky-attacker',
    label: 'VGC · Bulky Attacker (Nv.50)',
    format: 'VGC',
    level: 50,
    natureKey: 'adamant',
    ivs: ALL_31_IVS,
    evs: makeEvs({ hp: 252, attack: 252, specialDefense: 4 }),
  },
  {
    id: 'vgc-trick-room',
    label: 'VGC · Trick Room Especial (Nv.50)',
    format: 'VGC',
    level: 50,
    natureKey: 'quiet',
    ivs: { ...ZERO_ATK_IVS, speed: 0 },
    evs: makeEvs({ hp: 252, defense: 4, specialAttack: 252 }),
  },
  {
    id: 'smogon-ou-sweeper',
    label: 'Smogon OU · Sweeper Físico (Nv.100)',
    format: 'Smogon OU',
    level: 100,
    natureKey: 'jolly',
    ivs: ALL_31_IVS,
    evs: makeEvs({ attack: 252, specialDefense: 4, speed: 252 }),
  },
  {
    id: 'smogon-ou-special',
    label: 'Smogon OU · Sweeper Especial (Nv.100)',
    format: 'Smogon OU',
    level: 100,
    natureKey: 'timid',
    ivs: ZERO_ATK_IVS,
    evs: makeEvs({ specialAttack: 252, specialDefense: 4, speed: 252 }),
  },
  {
    id: 'smogon-ou-phys-wall',
    label: 'Smogon OU · Wall Física (Nv.100)',
    format: 'Smogon OU',
    level: 100,
    natureKey: 'impish',
    ivs: ALL_31_IVS,
    evs: makeEvs({ hp: 252, defense: 252, specialDefense: 4 }),
  },
  {
    id: 'smogon-ou-spec-wall',
    label: 'Smogon OU · Wall Especial (Nv.100)',
    format: 'Smogon OU',
    level: 100,
    natureKey: 'calm',
    ivs: ZERO_ATK_IVS,
    evs: makeEvs({ hp: 252, defense: 4, specialDefense: 252 }),
  },
];

const SHOWDOWN_STAT_KEYS: ReadonlyArray<readonly [StatSpreadKey, string]> = [
  ['hp', 'HP'],
  ['attack', 'Atk'],
  ['defense', 'Def'],
  ['specialAttack', 'SpA'],
  ['specialDefense', 'SpD'],
  ['speed', 'Spe'],
];

const TOKEN_TO_STAT_KEY: Readonly<Record<string, StatSpreadKey>> = {
  hp: 'hp',
  atk: 'attack',
  attack: 'attack',
  def: 'defense',
  defense: 'defense',
  spa: 'specialAttack',
  spatk: 'specialAttack',
  spd: 'specialDefense',
  spdef: 'specialDefense',
  spe: 'speed',
  speed: 'speed',
};

const NATURE_KEYS = new Set(POKEMON_NATURES.map((entry) => entry.key));

export function formatShowdownSpread(params: {
  readonly pokemonName: string;
  readonly level: number;
  readonly natureKey: string;
  readonly ivs: BaseStatsSpread;
  readonly evs: BaseStatsSpread;
}): string {
  const safeLevel = Math.max(1, Math.min(100, Math.floor(params.level || 50)));
  const rawNature = params.natureKey.trim().toLowerCase();
  const natureTitle = rawNature ? rawNature.charAt(0).toUpperCase() + rawNature.slice(1) : 'Hardy';
  const lines = [params.pokemonName.trim() || 'Pokemon', `Level: ${safeLevel}`];
  const evParts = SHOWDOWN_STAT_KEYS.filter(([key]) => params.evs[key] > 0).map(
    ([key, label]) => `${params.evs[key]} ${label}`,
  );
  if (evParts.length > 0) lines.push(`EVs: ${evParts.join(' / ')}`);
  lines.push(`${natureTitle} Nature`);
  const ivParts = SHOWDOWN_STAT_KEYS.filter(([key]) => params.ivs[key] < 31).map(
    ([key, label]) => `${params.ivs[key]} ${label}`,
  );
  if (ivParts.length > 0) lines.push(`IVs: ${ivParts.join(' / ')}`);
  return lines.join('\n');
}

export interface ParsedShowdownSpread {
  readonly level: number | null;
  readonly natureKey: string | null;
  readonly ivs: BaseStatsSpread;
  readonly evs: BaseStatsSpread;
}

export type ShowdownParseOutcome =
  | { readonly ok: true; readonly data: ParsedShowdownSpread; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly error: string };

interface MutableParseContext {
  level: number | null;
  natureKey: string | null;
  readonly evs: Record<StatSpreadKey, number>;
  readonly ivs: Record<StatSpreadKey, number>;
  readonly warnings: string[];
  recognizedField: boolean;
}

function parseStatPairs(
  segment: string,
  target: Record<StatSpreadKey, number>,
  maxPerStat: number,
  maxTotal: number | null,
  warnings: string[],
): boolean {
  let matched = false;
  let runningTotal = 0;
  for (const part of segment.split('/')) {
    const match = /^\s*(-?\d+)\s+([a-z.]+)\s*$/i.exec(part);
    const rawNum = match?.[1];
    const rawStat = match?.[2];
    if (!rawNum || !rawStat) continue;
    const key = TOKEN_TO_STAT_KEY[rawStat.replaceAll('.', '').toLowerCase()];
    if (!key) continue;
    matched = true;
    const parsedNum = Number.parseInt(rawNum, 10);
    let clamped = Math.max(0, Math.min(maxPerStat, parsedNum));
    if (clamped !== parsedNum) warnings.push(`${key}: ajustado para ${clamped}`);
    if (maxTotal !== null && runningTotal + clamped > maxTotal) {
      clamped = Math.max(0, maxTotal - runningTotal);
      warnings.push(`Total de EVs limitado a ${MAX_EV_TOTAL}.`);
    }
    runningTotal += clamped;
    target[key] = clamped;
  }
  return matched;
}

function applyShowdownLine(line: string, ctx: MutableParseContext): void {
  const lvlMatch = /^level\s*:\s*(-?\d+)$/i.exec(line);
  if (lvlMatch?.[1]) {
    const parsed = Number.parseInt(lvlMatch[1], 10);
    ctx.level = Math.max(1, Math.min(100, parsed));
    if (ctx.level !== parsed) ctx.warnings.push(`Nível ajustado para ${ctx.level}.`);
    ctx.recognizedField = true;
    return;
  }
  if (/^evs\s*:/i.test(line)) {
    const seg = line.replace(/^evs\s*:/i, '');
    if (parseStatPairs(seg, ctx.evs, MAX_EV_PER_STAT, MAX_EV_TOTAL, ctx.warnings)) {
      ctx.recognizedField = true;
    }
    return;
  }
  if (/^ivs\s*:/i.test(line)) {
    const seg = line.replace(/^ivs\s*:/i, '');
    if (parseStatPairs(seg, ctx.ivs, 31, null, ctx.warnings)) {
      ctx.recognizedField = true;
    }
    return;
  }
  const natMatch = /^([a-z]+)(?:\s+nature)?$/i.exec(line);
  const natKey = natMatch?.[1]?.toLowerCase();
  if (natKey && NATURE_KEYS.has(natKey)) {
    ctx.natureKey = natKey;
    ctx.recognizedField = true;
  }
}

export function parseShowdownSpread(rawText: string): ShowdownParseOutcome {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, error: 'Cole um spread no formato Showdown antes de importar.' };
  }
  const ctx: MutableParseContext = {
    level: null,
    natureKey: null,
    evs: makeEvs({}),
    ivs: { ...ALL_31_IVS },
    warnings: [],
    recognizedField: false,
  };
  for (const rawLine of trimmed.split(/\r?\n+/)) {
    const line = rawLine.trim();
    if (line) applyShowdownLine(line, ctx);
  }
  if (!ctx.recognizedField) {
    return {
      ok: false,
      error: 'Nenhum campo válido encontrado (use Level:, EVs:, IVs: ou <Nature> Nature).',
    };
  }
  return {
    ok: true,
    data: { level: ctx.level, natureKey: ctx.natureKey, ivs: ctx.ivs, evs: ctx.evs },
    warnings: ctx.warnings,
  };
}
