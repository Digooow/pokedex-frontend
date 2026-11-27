import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  scanRepositorySecrets,
  validatePrismaSchema,
} from './ci-parity-checks.mjs';
import { formatParityFinding, scanFileParity } from './sonar-parity-rules.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

const PRETTIER_PATTERNS = [
  /^packages\/shared\/src\/.*\.ts$/,
  /^apps\/api\/(?:src|test)\/.*\.ts$/,
  /^apps\/web\/(?:src|cloudflare|e2e)\/.*\.ts$/,
  /^apps\/web\/playwright\.config\.ts$/,
];

const PARITY_SKIP_SEGMENTS = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.angular',
]);

function normalizeRelPath(rel) {
  return rel.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function isPrettierTrackedFile(rel) {
  const normalized = normalizeRelPath(rel);
  return PRETTIER_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isParityTrackedFile(rel) {
  const normalized = normalizeRelPath(rel);
  if (!normalized.startsWith('apps/') && !normalized.startsWith('packages/')) {
    return false;
  }
  if (!/\.(ts|js|html|scss)$/.test(normalized)) {
    return false;
  }
  if (
    normalized.startsWith('apps/api/prisma/migrations/') ||
    normalized.startsWith('apps/web/public/assets/draco/')
  ) {
    return false;
  }
  const segments = normalized.split('/');
  return !segments.some((segment) => PARITY_SKIP_SEGMENTS.has(segment));
}

export function hasPrismaChanges(stagedFiles) {
  return stagedFiles.some((filePath) =>
    normalizeRelPath(filePath).startsWith('apps/api/prisma/'),
  );
}

function getStagedFiles(repoRoot) {
  if (!fs.existsSync(path.join(repoRoot, '.git'))) {
    return [];
  }
  try {
    const raw = execFileSync(
      'git',
      ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
      { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    const files = [];
    for (const entry of raw.split('\0')) {
      if (!entry) {
        continue;
      }
      const normalized = normalizeRelPath(entry);
      const fullPath = path.join(repoRoot, normalized);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        files.push(normalized);
      }
    }
    return files;
  } catch {
    return [];
  }
}

function checkStagedPrettier(repoRoot, prettierFiles) {
  if (prettierFiles.length === 0) {
    return [];
  }
  const prettierBin = path.join(
    repoRoot,
    'node_modules',
    'prettier',
    'bin',
    'prettier.cjs',
  );
  if (!fs.existsSync(prettierBin)) {
    return [
      '[prettier] Missing local Prettier CLI at node_modules/prettier/bin/prettier.cjs.',
    ];
  }
  const result = spawnSync(
    process.execPath,
    [prettierBin, '--check', ...prettierFiles],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (result.status === 0) {
    return [];
  }
  const detail = (result.stderr || result.stdout || 'Formatting check failed.')
    .trim()
    .slice(0, 600);
  return [`[prettier] ${detail}`];
}

export function runFastCommitChecks(repoRoot = REPO_ROOT) {
  const startMs = Date.now();
  const failures = [];

  const { findings: secretFindings } = scanRepositorySecrets(repoRoot);
  for (const finding of secretFindings) {
    failures.push(`[secrets:${finding.rule}] ${finding.file}:${finding.line}`);
  }

  const stagedFiles = getStagedFiles(repoRoot);

  if (hasPrismaChanges(stagedFiles)) {
    const prismaErrors = validatePrismaSchema(repoRoot);
    failures.push(...prismaErrors.map((err) => `[prisma] ${err}`));
  }

  const parityFiles = stagedFiles.filter((rel) => isParityTrackedFile(rel));
  for (const rel of parityFiles) {
    const content = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    const parityFindings = scanFileParity(rel, content);
    failures.push(
      ...parityFindings.map((item) => formatParityFinding(item)),
    );
  }

  const prettierFiles = stagedFiles.filter((rel) => isPrettierTrackedFile(rel));
  failures.push(...checkStagedPrettier(repoRoot, prettierFiles));

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(2);
  if (failures.length > 0) {
    console.error(`[verify:commit] FAILED in ${elapsedSec}s:`);
    for (const msg of failures) {
      console.error(`  - ${msg}`);
    }
    process.exitCode = 1;
    return false;
  }

  console.log(
    `[verify:commit] PASSED in ${elapsedSec}s (secrets + ${parityFiles.length} staged parity + ${prettierFiles.length} staged prettier files).`,
  );
  return true;
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  runFastCommitChecks();
}
