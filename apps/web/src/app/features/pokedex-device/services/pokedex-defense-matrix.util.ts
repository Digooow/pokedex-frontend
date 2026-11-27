import { type PokemonBundle, formatPokeApiText } from '@pokeverse/shared';

export type EffectivenessBucketVariant =
  | 'quad-weak'
  | 'weak'
  | 'resist'
  | 'quad-resist'
  | 'immune';

export interface EffectivenessBucketView {
  readonly label: string;
  readonly variant: EffectivenessBucketVariant;
  readonly types: readonly string[];
}

export const DEFENSIVE_BUCKET_LABELS: Readonly<Record<EffectivenessBucketVariant, string>> = {
  'quad-weak': 'Fraco contra (4x)',
  weak: 'Fraco contra (2x)',
  resist: 'Forte contra (0.5x)',
  'quad-resist': 'Forte contra (0.25x)',
  immune: 'Imune a (0x)',
};

export const COMPARE_DEFENSE_LABELS = {
  weak: 'Fraco contra (4x/2x)',
  strong: 'Forte contra (0.5x/0.25x)',
  immune: 'Imune a (0x)',
} as const;

type MatrixBucketKey = 'quadWeak' | 'weak' | 'resistant' | 'quadResistant' | 'immune';

const MATRIX_BUCKET_SPECS: ReadonlyArray<{
  readonly key: MatrixBucketKey;
  readonly variant: EffectivenessBucketVariant;
}> = [
  { key: 'quadWeak', variant: 'quad-weak' },
  { key: 'weak', variant: 'weak' },
  { key: 'resistant', variant: 'resist' },
  { key: 'quadResistant', variant: 'quad-resist' },
  { key: 'immune', variant: 'immune' },
];

export function buildDefensiveEffectivenessBuckets(
  matrix: PokemonBundle['typeEffectiveness'] | null | undefined,
): readonly EffectivenessBucketView[] {
  if (!matrix) return [];

  const buckets: EffectivenessBucketView[] = [];
  for (const spec of MATRIX_BUCKET_SPECS) {
    const rawTypes = matrix[spec.key];
    if (rawTypes.length === 0) continue;
    buckets.push({
      label: DEFENSIVE_BUCKET_LABELS[spec.variant],
      variant: spec.variant,
      types: rawTypes.map((item) => formatPokeApiText(item)),
    });
  }
  return buckets;
}
