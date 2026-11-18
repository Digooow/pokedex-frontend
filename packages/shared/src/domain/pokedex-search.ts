import { MAX_CATALOG_RESULTS } from '../constants/platform.constants';

export interface SearchablePokemonItem {
  readonly id: number;
  readonly name: string;
  readonly displayName: string;
  readonly compactName: string;
  readonly phoneticName: string;
}

export interface CatalogMatchItem extends SearchablePokemonItem {
  readonly score: number;
  readonly approximate: boolean;
}

export interface CatalogFilterResult {
  readonly mode: 'all' | 'exact' | 'approximate';
  readonly items: readonly CatalogMatchItem[];
}

export function normalizePokemonName(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, '-');
}

export function cleanComparisonText(text: string): string {
  return text
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, '');
}

export function buildPhoneticKey(text: string): string {
  return cleanComparisonText(text)
    .replaceAll('ph', 'f')
    .replaceAll('ch', 'x')
    .replaceAll('qu', 'k')
    .replaceAll('y', 'i')
    .replaceAll('w', 'u')
    .replaceAll(/c(?=[ei])/g, 's')
    .replaceAll('z', 's')
    .replaceAll('k', 'c')
    .replaceAll(/(.)\1+/g, '$1');
}

function computeDamerauCell(
  dp: Int32Array,
  stride: number,
  source: string,
  target: string,
  i: number,
  j: number,
  maxDistance: number,
): number {
  const srcChar = source.charAt(i - 1);
  const tgtChar = target.charAt(j - 1);
  const cost = srcChar === tgtChar ? 0 : 1;

  const up = (dp[(i - 1) * stride + j] ?? maxDistance) + 1;
  const left = (dp[i * stride + (j - 1)] ?? maxDistance) + 1;
  const diag = (dp[(i - 1) * stride + (j - 1)] ?? maxDistance) + cost;

  let best = Math.min(up, left, diag);

  const canTranspose =
    i > 1 &&
    j > 1 &&
    srcChar === target.charAt(j - 2) &&
    source.charAt(i - 2) === tgtChar;

  if (canTranspose) {
    const transposition = (dp[(i - 2) * stride + (j - 2)] ?? maxDistance) + cost;
    best = Math.min(best, transposition);
  }

  return best;
}

/**
 * Optimal string alignment / restricted Damerau-Levenshtein distance.
 * Uses a flat Int32Array matrix to avoid nested allocation inside large catalog scans.
 */
export function computeDamerauDistance(
  source: string,
  target: string,
  maxDistance: number,
): number {
  const m = source.length;
  const n = target.length;

  if (Math.abs(m - n) > maxDistance) {
    return maxDistance + 1;
  }

  const stride = n + 1;
  const dp = new Int32Array((m + 1) * stride);

  for (let i = 0; i <= m; i += 1) {
    dp[i * stride] = i;
  }
  for (let j = 0; j <= n; j += 1) {
    dp[j] = j;
  }

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i * stride + j] = computeDamerauCell(dp, stride, source, target, i, j, maxDistance);
    }
  }

  return dp[m * stride + n] ?? maxDistance + 1;
}

export function extractPokemonIdFromUrl(url: string): number {
  const match = /\/(\d+)\/?$/.exec(url);
  if (!match?.[1]) {
    return 0;
  }
  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

export function formatPokeApiText(text: string | null | undefined): string {
  if (!text?.trim()) {
    return 'Não informado';
  }
  return text
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function buildSearchableCatalogItem(id: number, name: string): SearchablePokemonItem {
  const normalized = normalizePokemonName(name);
  return {
    id,
    name: normalized,
    displayName: formatPokeApiText(normalized),
    compactName: cleanComparisonText(normalized),
    phoneticName: buildPhoneticKey(normalized),
  };
}

function filterByNumericId(
  catalog: readonly SearchablePokemonItem[],
  numericQuery: string,
  maxResults: number,
): CatalogFilterResult {
  const exactId = Number(numericQuery);
  const idText = String(exactId);
  const matches: CatalogMatchItem[] = [];

  for (const pokemon of catalog) {
    const strId = String(pokemon.id);
    if (pokemon.id === exactId) {
      matches.push({ ...pokemon, score: 0, approximate: false });
    } else if (strId.startsWith(idText)) {
      matches.push({ ...pokemon, score: 100 + pokemon.id, approximate: false });
    } else if (strId.includes(idText)) {
      matches.push({ ...pokemon, score: 200 + pokemon.id, approximate: false });
    }
  }

  matches.sort((a, b) => a.score - b.score || a.id - b.id);
  return { mode: 'exact', items: matches.slice(0, maxResults) };
}

interface SearchContext {
  readonly normalized: string;
  readonly compact: string;
  readonly phonetic: string;
  readonly maxDistance: number;
}

function evaluateExactMatch(
  pokemon: SearchablePokemonItem,
  ctx: SearchContext,
): CatalogMatchItem | null {
  if (pokemon.name === ctx.normalized || pokemon.compactName === ctx.compact) {
    return { ...pokemon, score: 0, approximate: false };
  }

  const formPenalty = pokemon.name.includes('-') ? 20 : 0;
  if (pokemon.name.startsWith(ctx.normalized) || pokemon.compactName.startsWith(ctx.compact)) {
    return {
      ...pokemon,
      score: 100 + formPenalty + Math.abs(pokemon.compactName.length - ctx.compact.length),
      approximate: false,
    };
  }

  const substringIdx = pokemon.compactName.indexOf(ctx.compact);
  if (substringIdx !== -1) {
    return {
      ...pokemon,
      score: 300 + substringIdx + formPenalty,
      approximate: false,
    };
  }

  return null;
}

function evaluateApproximateMatch(
  pokemon: SearchablePokemonItem,
  ctx: SearchContext,
): CatalogMatchItem | null {
  if (ctx.phonetic.length >= 3 && pokemon.phoneticName === ctx.phonetic) {
    return { ...pokemon, score: 400 + pokemon.id, approximate: true };
  }

  if (ctx.phonetic.length >= 3 && pokemon.phoneticName.startsWith(ctx.phonetic)) {
    return {
      ...pokemon,
      score: 500 + Math.abs(pokemon.phoneticName.length - ctx.phonetic.length),
      approximate: true,
    };
  }

  if (ctx.maxDistance <= 0) {
    return null;
  }

  const rawDist = computeDamerauDistance(ctx.compact, pokemon.compactName, ctx.maxDistance);
  const phoneticDist = ctx.phonetic
    ? computeDamerauDistance(ctx.phonetic, pokemon.phoneticName, ctx.maxDistance)
    : ctx.maxDistance + 1;
  const minDist = Math.min(rawDist, phoneticDist);

  if (minDist > ctx.maxDistance) {
    return null;
  }

  const formPenalty = pokemon.name.includes('-') ? 10 : 0;
  return {
    ...pokemon,
    score:
      600 + minDist * 100 + formPenalty + Math.abs(pokemon.compactName.length - ctx.compact.length),
    approximate: true,
  };
}

/** Filters a Pokémon catalog supporting numeric IDs, exact prefixes, phonetics, and typos. */
export function filterPokemonCatalog(
  catalog: readonly SearchablePokemonItem[],
  rawQuery: string,
  maxResults = MAX_CATALOG_RESULTS,
): CatalogFilterResult {
  const safeLimit = Math.max(0, Math.floor(maxResults));
  if (catalog.length === 0 || safeLimit === 0) {
    return { mode: 'all', items: [] };
  }

  const query = rawQuery.trim();
  if (!query) {
    return {
      mode: 'all',
      items: catalog.slice(0, safeLimit).map((item) => ({ ...item, score: 0, approximate: false })),
    };
  }

  const numericCandidate = query.replace(/^#/, '');
  if (/^\d+$/.test(numericCandidate)) {
    return filterByNumericId(catalog, numericCandidate, safeLimit);
  }

  const compact = cleanComparisonText(query);
  if (!compact) {
    return {
      mode: 'all',
      items: catalog.slice(0, safeLimit).map((item) => ({ ...item, score: 0, approximate: false })),
    };
  }

  const maxDistance =
    compact.length >= 3 ? Math.min(4, Math.max(1, Math.floor(compact.length * 0.45))) : 0;
  const ctx: SearchContext = {
    normalized: normalizePokemonName(query),
    compact,
    phonetic: buildPhoneticKey(query),
    maxDistance,
  };

  const exactMatches: CatalogMatchItem[] = [];
  const approxMatches: CatalogMatchItem[] = [];

  for (const pokemon of catalog) {
    const exact = evaluateExactMatch(pokemon, ctx);
    if (exact) {
      exactMatches.push(exact);
      continue;
    }

    const approx = evaluateApproximateMatch(pokemon, ctx);
    if (approx) {
      approxMatches.push(approx);
    }
  }

  if (exactMatches.length > 0) {
    exactMatches.sort((a, b) => a.score - b.score || a.id - b.id);
    return { mode: 'exact', items: exactMatches.slice(0, safeLimit) };
  }

  approxMatches.sort((a, b) => a.score - b.score || a.id - b.id);
  return { mode: 'approximate', items: approxMatches.slice(0, safeLimit) };
}
