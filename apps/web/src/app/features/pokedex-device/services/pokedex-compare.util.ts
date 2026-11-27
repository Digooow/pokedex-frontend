import { formatPokeApiText } from '@pokeverse/shared';
import type { PokemonDetailView } from './pokedex-view-mapper.util';

export interface CompareStatSpec {
  readonly key: string;
  readonly label: string;
}

export const COMPARE_STAT_SPECS: readonly CompareStatSpec[] = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: 'ATK' },
  { key: 'defense', label: 'DEF' },
  { key: 'special-attack', label: 'SPA' },
  { key: 'special-defense', label: 'SPD' },
  { key: 'speed', label: 'SPE' },
];

export type CompareWinner = 'left' | 'right' | 'tie';

export interface CompareStatRow {
  readonly key: string;
  readonly label: string;
  readonly leftValue: number;
  readonly rightValue: number;
  readonly delta: number;
  readonly deltaLabel: string;
  readonly winner: CompareWinner;
  readonly leftPercent: number;
  readonly rightPercent: number;
}

export interface DefenseHighlights {
  readonly quadWeak: readonly string[];
  readonly weak: readonly string[];
  readonly resistant: readonly string[];
  readonly quadResistant: readonly string[];
  readonly immune: readonly string[];
}

export interface CompareVerdictSummary {
  readonly leftWins: number;
  readonly rightWins: number;
  readonly ties: number;
  readonly bstDelta: number;
  readonly bstWinner: CompareWinner;
}

function readStatValue(pokemon: PokemonDetailView, spec: CompareStatSpec): number {
  const bundleStat = pokemon.bundle?.pokemon.stats.find(
    (entry) => entry.stat.name.toLowerCase() === spec.key,
  );
  if (bundleStat) return bundleStat.base_stat;

  const formattedTarget = formatPokeApiText(spec.key).toLowerCase();
  const fallback = pokemon.stats.find((entry) => entry.label.toLowerCase() === formattedTarget);
  return fallback?.value ?? 0;
}

function resolveWinner(left: number, right: number): CompareWinner {
  if (left > right) return 'left';
  if (right > left) return 'right';
  return 'tie';
}

function formatDeltaLabel(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return String(delta);
  return '=';
}

function toStatPercent(value: number, maxScale: number): number {
  if (value <= 0) return 0;
  return Math.max(4, Math.min(100, Math.round((value / maxScale) * 100)));
}

export function buildCompareStatRows(
  left: PokemonDetailView,
  right: PokemonDetailView,
): readonly CompareStatRow[] {
  const rows: CompareStatRow[] = [];
  let leftTotal = 0;
  let rightTotal = 0;

  for (const spec of COMPARE_STAT_SPECS) {
    const leftVal = readStatValue(left, spec);
    const rightVal = readStatValue(right, spec);
    leftTotal += leftVal;
    rightTotal += rightVal;
    const delta = leftVal - rightVal;
    rows.push({
      key: spec.key,
      label: spec.label,
      leftValue: leftVal,
      rightValue: rightVal,
      delta,
      deltaLabel: formatDeltaLabel(delta),
      winner: resolveWinner(leftVal, rightVal),
      leftPercent: toStatPercent(leftVal, 255),
      rightPercent: toStatPercent(rightVal, 255),
    });
  }

  const leftBst = left.bundle?.pokemon.baseStatTotal ?? leftTotal;
  const rightBst = right.bundle?.pokemon.baseStatTotal ?? rightTotal;
  const bstDelta = leftBst - rightBst;
  rows.push({
    key: 'bst',
    label: 'BST',
    leftValue: leftBst,
    rightValue: rightBst,
    delta: bstDelta,
    deltaLabel: formatDeltaLabel(bstDelta),
    winner: resolveWinner(leftBst, rightBst),
    leftPercent: toStatPercent(leftBst, 780),
    rightPercent: toStatPercent(rightBst, 780),
  });

  return rows;
}

export function buildDefenseHighlights(pokemon: PokemonDetailView): DefenseHighlights | null {
  const eff = pokemon.bundle?.typeEffectiveness;
  if (!eff) return null;
  return {
    quadWeak: eff.quadWeak.map((item) => formatPokeApiText(item)),
    weak: eff.weak.map((item) => formatPokeApiText(item)),
    resistant: eff.resistant.map((item) => formatPokeApiText(item)),
    quadResistant: eff.quadResistant.map((item) => formatPokeApiText(item)),
    immune: eff.immune.map((item) => formatPokeApiText(item)),
  };
}

export function summarizeCompareVerdict(rows: readonly CompareStatRow[]): CompareVerdictSummary {
  let leftWins = 0;
  let rightWins = 0;
  let ties = 0;
  let bstDelta = 0;
  let bstWinner: CompareWinner = 'tie';

  for (const row of rows) {
    if (row.key === 'bst') {
      bstDelta = row.delta;
      bstWinner = row.winner;
      continue;
    }
    if (row.winner === 'left') leftWins += 1;
    else if (row.winner === 'right') rightWins += 1;
    else ties += 1;
  }

  return { leftWins, rightWins, ties, bstDelta, bstWinner };
}
