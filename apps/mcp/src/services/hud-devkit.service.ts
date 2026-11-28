import fs from 'node:fs';
import path from 'node:path';

export interface CssTokenEntry {
  readonly name: string;
  readonly value: string;
}

export interface ContrastCheckResult {
  readonly foregroundHex: string;
  readonly backgroundHex: string;
  readonly contrastRatio: number;
  readonly passesAaNormalText: boolean;
  readonly passesAaLargeOrUi: boolean;
  readonly passesAaaNormalText: boolean;
}

function parseHexChannel(hex: string, offset: number): number {
  const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function computeRelativeLuminance(hex: string): number {
  const clean = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`Expected #RRGGBB hex color, got "${hex}".`);
  }
  const r = parseHexChannel(clean, 0);
  const g = parseHexChannel(clean, 2);
  const b = parseHexChannel(clean, 4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function evaluateWcagContrast(
  foregroundHex: string,
  backgroundHex: string,
): ContrastCheckResult {
  const fgLum = computeRelativeLuminance(foregroundHex);
  const bgLum = computeRelativeLuminance(backgroundHex);
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  const ratio = Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));

  return {
    foregroundHex: foregroundHex.trim().toLowerCase(),
    backgroundHex: backgroundHex.trim().toLowerCase(),
    contrastRatio: ratio,
    passesAaNormalText: ratio >= 4.5,
    passesAaLargeOrUi: ratio >= 3,
    passesAaaNormalText: ratio >= 7,
  };
}

export function readDesignTokens(repoRoot: string): readonly CssTokenEntry[] {
  const tokensPath = path.join(repoRoot, 'apps', 'web', 'src', 'styles', '_tokens.scss');
  if (!fs.existsSync(tokensPath)) {
    return [];
  }
  const lines = fs.readFileSync(tokensPath, 'utf8').split(/\r?\n/);
  const entries: CssTokenEntry[] = [];
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed.startsWith('--pv-')) {
      continue;
    }
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      continue;
    }
    const name = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();
    const value = rawValue.endsWith(';') ? rawValue.slice(0, -1).trim() : rawValue;
    if (name && value) {
      entries.push({ name, value });
    }
  }
  return entries;
}

export function readWebBudgets(repoRoot: string): {
  readonly budgets: ReadonlyArray<Record<string, unknown>>;
  readonly oversizedComponents: readonly { readonly file: string; readonly lines: number }[];
} {
  const angularPath = path.join(repoRoot, 'apps', 'web', 'angular.json');
  let budgets: Array<Record<string, unknown>> = [];
  if (fs.existsSync(angularPath)) {
    const parsed = JSON.parse(fs.readFileSync(angularPath, 'utf8')) as {
      projects?: {
        'pokeverse-web'?: {
          architect?: {
            build?: {
              configurations?: {
                production?: { budgets?: Array<Record<string, unknown>> };
              };
            };
          };
        };
      };
    };
    budgets =
      parsed.projects?.['pokeverse-web']?.architect?.build?.configurations?.production?.budgets ??
      [];
  }

  const featuresDir = path.join(repoRoot, 'apps', 'web', 'src', 'app', 'features');
  const oversizedComponents: Array<{ file: string; lines: number }> = [];
  if (fs.existsSync(featuresDir)) {
    scanComponentLineCounts(repoRoot, featuresDir, oversizedComponents);
  }

  return { budgets, oversizedComponents };
}

function scanComponentLineCounts(
  repoRoot: string,
  dirPath: string,
  out: Array<{ file: string; lines: number }>,
): void {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      scanComponentLineCounts(repoRoot, full, out);
      continue;
    }
    if (!entry.name.endsWith('.component.ts')) {
      continue;
    }
    const lineCount = fs.readFileSync(full, 'utf8').split(/\r?\n/).length;
    if (lineCount > 200) {
      out.push({
        file: path.relative(repoRoot, full).replaceAll('\\', '/'),
        lines: lineCount,
      });
    }
  }
}
