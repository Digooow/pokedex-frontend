import fs from 'node:fs';
import path from 'node:path';

export const ALLOWED_TEXTURE_WRITE_PREFIX = 'apps/web/public/assets/textures/generated/';

export function findRepoRoot(startDir = process.cwd()): string {
  const envRoot = process.env['POKEVERSE_REPO_ROOT']?.trim();
  if (envRoot && fs.existsSync(path.join(envRoot, 'package.json'))) {
    return path.resolve(envRoot);
  }

  let current = path.resolve(startDir);
  for (let depth = 0; depth < 8; depth += 1) {
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath) && fs.existsSync(path.join(current, 'apps'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return path.resolve(startDir);
}

export function toPosixRelative(repoRoot: string, targetPath: string): string {
  return path.relative(repoRoot, targetPath).replaceAll('\\', '/');
}

function resolveCanonicalPath(candidatePath: string): string {
  if (fs.existsSync(candidatePath)) {
    return fs.realpathSync(candidatePath);
  }
  const missingParts: string[] = [];
  let cursor = candidatePath;
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      return path.resolve(candidatePath);
    }
    missingParts.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.join(fs.realpathSync(cursor), ...missingParts);
}

export function resolveSafeWorkspacePath(params: {
  readonly repoRoot: string;
  readonly relativePath: string;
  readonly allowedPrefixes?: readonly string[];
}): { readonly fullPath: string; readonly relativePosix: string } {
  const { repoRoot, relativePath, allowedPrefixes } = params;
  const trimmed = relativePath.trim();
  if (!trimmed || trimmed.includes('\0') || path.isAbsolute(trimmed)) {
    throw new Error('Path must be a non-empty relative path inside the repository.');
  }

  const canonicalRoot = fs.realpathSync(repoRoot);
  const candidate = path.resolve(canonicalRoot, trimmed);
  const canonicalTarget = resolveCanonicalPath(candidate);
  const rel = path.relative(canonicalRoot, canonicalTarget);

  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes repository boundary: "${relativePath}".`);
  }

  const relativePosix = rel.replaceAll('\\', '/');
  if (
    allowedPrefixes?.length &&
    !allowedPrefixes.some((prefix) => relativePosix.startsWith(prefix))
  ) {
    throw new Error(
      `Write path "${relativePosix}" is outside allowed prefixes: ${allowedPrefixes.join(', ')}.`,
    );
  }

  return { fullPath: canonicalTarget, relativePosix };
}
