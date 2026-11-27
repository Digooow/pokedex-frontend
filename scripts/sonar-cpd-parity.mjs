import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const SONAR_CPD_MIN_LINES = 10;
export const SONAR_CPD_MIN_TOKENS = 100;

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.angular']);
const DEFAULT_EXCLUDED_PREFIXES = [
  'apps/api/prisma/migrations/',
  'apps/web/public/assets/draco/',
];
const DEFAULT_EXCLUDED_SUFFIXES = ['.spec.ts', '.e2e-spec.ts'];
const SOURCE_EXTENSION_REGEX = /\.(?:ts|js|mjs|cjs)$/;

const NORMALIZED_LITERAL_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);

function normalizeRelPath(rel) {
  return rel.replaceAll('\\', '/').replace(/^\.\//, '');
}

function globToRegExp(glob) {
  const normalized = normalizeRelPath(glob.trim());
  const escaped = normalized
    .replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`)
    .replaceAll('**/', '(?:.*/)?')
    .replaceAll('**', '.*')
    .replaceAll('*', '[^/]*');
  return new RegExp(`^${escaped}$`);
}

export function isCpdExcluded(rel, exclusions = []) {
  const normalized = normalizeRelPath(rel);
  const segments = normalized.split('/');
  if (segments.some((segment) => SKIP_DIRS.has(segment))) {
    return true;
  }
  if (
    DEFAULT_EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  ) {
    return true;
  }
  if (
    DEFAULT_EXCLUDED_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  ) {
    return true;
  }
  return exclusions.some((pattern) => globToRegExp(pattern).test(normalized));
}

function collectImportRanges(sourceFile) {
  const ranges = [];
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt) || ts.isImportEqualsDeclaration(stmt)) {
      ranges.push([stmt.getStart(sourceFile), stmt.getEnd()]);
    }
  }
  return ranges;
}

export function tokenizeLinesForSonarCpd(filePath, content) {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    false,
  );
  const importRanges = collectImportRanges(sourceFile);
  let importIdx = 0;

  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    content,
  );

  const byLine = new Map();
  let tokenKind = scanner.scan();

  while (tokenKind !== ts.SyntaxKind.EndOfFileToken) {
    const pos = scanner.getTokenPos();
    while (
      importIdx < importRanges.length &&
      pos >= importRanges[importIdx][1]
    ) {
      importIdx += 1;
    }

    const insideImport =
      importIdx < importRanges.length &&
      pos >= importRanges[importIdx][0] &&
      pos < importRanges[importIdx][1];

    if (!insideImport) {
      const value = NORMALIZED_LITERAL_KINDS.has(tokenKind)
        ? 'LITERAL'
        : scanner.getTokenText();
      const line = sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
      let lineTokens = byLine.get(line);
      if (!lineTokens) {
        lineTokens = [];
        byLine.set(line, lineTokens);
      }
      lineTokens.push(value);
    }

    tokenKind = scanner.scan();
  }

  return Array.from(byLine.entries()).map(([line, tokens]) => ({
    line,
    count: tokens.length,
    sig: tokens.join('\x1f'),
  }));
}

function isSubsumedClone(clones, candidate) {
  return clones.some(
    (existing) =>
      existing.fileA === candidate.fileA &&
      existing.fileB === candidate.fileB &&
      candidate.startLineA >= existing.startLineA &&
      candidate.endLineA <= existing.endLineA &&
      candidate.startLineB >= existing.startLineB &&
      candidate.endLineB <= existing.endLineB,
  );
}

function extendMatch(prevLines, curLines, prevStart, curStart, minLines) {
  if (
    prevStart > 0 &&
    curStart > 0 &&
    prevLines[prevStart - 1].sig === curLines[curStart - 1].sig
  ) {
    return null;
  }

  let matchedLines = minLines;
  let tokens = 0;
  for (let offset = 0; offset < minLines; offset += 1) {
    tokens += curLines[curStart + offset].count;
  }

  while (
    prevStart + matchedLines < prevLines.length &&
    curStart + matchedLines < curLines.length &&
    prevLines[prevStart + matchedLines].sig ===
      curLines[curStart + matchedLines].sig
  ) {
    tokens += curLines[curStart + matchedLines].count;
    matchedLines += 1;
  }

  return { matchedLines, tokens };
}

export function detectSonarCpdClones(
  entries,
  { minLines = SONAR_CPD_MIN_LINES, minTokens = SONAR_CPD_MIN_TOKENS } = {},
) {
  const parsed = entries.map((entry) => ({
    file: normalizeRelPath(entry.file),
    lines: tokenizeLinesForSonarCpd(entry.file, entry.content),
  }));

  const windowIndex = new Map();
  const clones = [];

  for (let fileIdx = 0; fileIdx < parsed.length; fileIdx += 1) {
    const { file, lines } = parsed[fileIdx];
    for (let lineIdx = 0; lineIdx <= lines.length - minLines; lineIdx += 1) {
      let key = '';
      for (let offset = 0; offset < minLines; offset += 1) {
        key += `${lines[lineIdx + offset].sig}\n`;
      }

      let matches = windowIndex.get(key);
      if (!matches) {
        matches = [];
        windowIndex.set(key, matches);
      }

      for (const prev of matches) {
        const prevEntry = parsed[prev.fileIdx];
        const extended = extendMatch(
          prevEntry.lines,
          lines,
          prev.lineIdx,
          lineIdx,
          minLines,
        );
        if (!extended || extended.tokens < minTokens) {
          continue;
        }

        const candidate = {
          fileA: prevEntry.file,
          startLineA: prevEntry.lines[prev.lineIdx].line,
          endLineA:
            prevEntry.lines[prev.lineIdx + extended.matchedLines - 1].line,
          fileB: file,
          startLineB: lines[lineIdx].line,
          endLineB: lines[lineIdx + extended.matchedLines - 1].line,
          matchedLines: extended.matchedLines,
          tokens: extended.tokens,
        };

        if (!isSubsumedClone(clones, candidate)) {
          clones.push(candidate);
        }
      }

      matches.push({ fileIdx, lineIdx });
    }
  }

  return clones;
}

function walkCpdFiles(repoRoot, dirPath, exclusions, out = []) {
  if (!fs.existsSync(dirPath)) {
    return out;
  }
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    const rel = normalizeRelPath(path.relative(repoRoot, fullPath));
    if (entry.isDirectory()) {
      if (!isCpdExcluded(`${rel}/`, exclusions)) {
        walkCpdFiles(repoRoot, fullPath, exclusions, out);
      }
      continue;
    }
    if (SOURCE_EXTENSION_REGEX.test(entry.name) && !isCpdExcluded(rel, exclusions)) {
      out.push({ fullPath, rel });
    }
  }
  return out;
}

export function scanRepositorySonarCpd(
  repoRoot,
  sources = ['apps', 'packages'],
  exclusions = [],
  options = {},
) {
  const files = sources.flatMap((src) =>
    walkCpdFiles(repoRoot, path.join(repoRoot, src), exclusions),
  );
  const entries = files.map((file) => ({
    file: file.rel,
    content: fs.readFileSync(file.fullPath, 'utf8'),
  }));
  const clones = detectSonarCpdClones(entries, options);
  return { filesCount: files.length, clones };
}

export function formatSonarCpdClone(clone) {
  return `[sonar-cpd:type2] ${clone.fileA}:${clone.startLineA}-${clone.endLineA} <-> ${clone.fileB}:${clone.startLineB}-${clone.endLineB} (${clone.matchedLines} lines, ${clone.tokens} normalized tokens)`;
}
