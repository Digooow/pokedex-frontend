import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

const SECRET_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.angular',
  '.cache',
  'playwright-report',
  'test-results',
]);

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.webp',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.wasm',
  '.glb',
  '.gltf',
  '.mp3',
  '.ogg',
  '.wav',
  '.pdf',
  '.zip',
]);

const SECRET_RULES = [
  {
    id: 'private-key',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    id: 'github-pat',
    regex: /\b(?:ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})\b/g,
  },
  { id: 'aws-access-key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: 'google-api-key', regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  { id: 'resend-api-key', regex: /\bre_[A-Za-z0-9_]{24,}\b/g },
  { id: 'sonar-token', regex: /\b(?:sqp|squ|sqa)_[a-f0-9]{32,}\b/g },
  { id: 'slack-token', regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g },
];

const LIFECYCLE_HOOKS = ['preinstall', 'install', 'postinstall', 'prepare'];

function lineNumberAt(content, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.codePointAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

function extractTomlArrayStrings(sectionText, key) {
  const blockMatch = new RegExp(String.raw`${key}\s*=\s*\[([\s\S]*?)\]`).exec(sectionText);
  if (!blockMatch?.[1]) {
    return [];
  }
  const values = [];
  for (const match of blockMatch[1].matchAll(/'''([\s\S]*?)'''/g)) {
    if (match[1]) {
      values.push(new RegExp(match[1]));
    }
  }
  return values;
}

export function parseGitleaksAllowlist(repoRoot) {
  const tomlPath = path.join(repoRoot, '.gitleaks.toml');
  if (!fs.existsSync(tomlPath)) {
    return { paths: [], regexes: [] };
  }
  const content = fs.readFileSync(tomlPath, 'utf8');
  return {
    paths: extractTomlArrayStrings(content, 'paths'),
    regexes: extractTomlArrayStrings(content, 'regexes'),
  };
}

export function scanSecretsContent(rel, content, allowlist = { paths: [], regexes: [] }) {
  const normalized = rel.replaceAll('\\', '/');
  if (allowlist.paths.some((pattern) => pattern.test(normalized))) {
    return [];
  }
  const lines = content.split(/\r?\n/);
  const findings = [];
  for (const rule of SECRET_RULES) {
    const regex = new RegExp(rule.regex.source, rule.regex.flags);
    for (const match of content.matchAll(regex)) {
      const token = match[0] ?? '';
      if (allowlist.regexes.some((allowed) => allowed.test(token))) {
        continue;
      }
      const line = lineNumberAt(content, match.index ?? 0);
      const lineText = lines[line - 1] ?? '';
      if (lineText.includes('gitleaks:allow')) {
        continue;
      }
      findings.push({ rule: rule.id, file: normalized, line });
    }
  }
  return findings;
}

function walkRepoFiles(repoRoot, dirPath, out = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (SECRET_SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkRepoFiles(repoRoot, fullPath, out);
      continue;
    }
    if (entry.name === 'package-lock.json') {
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      continue;
    }
    out.push({
      fullPath,
      rel: path.relative(repoRoot, fullPath).replaceAll('\\', '/'),
    });
  }
  return out;
}

function listScannableRepoFiles(repoRoot) {
  if (fs.existsSync(path.join(repoRoot, '.git'))) {
    try {
      const raw = execFileSync(
        'git',
        ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
        { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
      );
      const out = [];
      for (const relRaw of raw.split('\0')) {
        if (!relRaw) {
          continue;
        }
        const rel = relRaw.replaceAll('\\', '/');
        const segments = rel.split('/');
        if (segments.some((seg) => SECRET_SKIP_DIRS.has(seg))) {
          continue;
        }
        if (path.basename(rel) === 'package-lock.json') {
          continue;
        }
        const ext = path.extname(rel).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) {
          continue;
        }
        const fullPath = path.join(repoRoot, rel);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          out.push({ fullPath, rel });
        }
      }
      return out;
    } catch {
      // Fallback to directory walk when git is unavailable
    }
  }
  return walkRepoFiles(repoRoot, repoRoot);
}

export function scanRepositorySecrets(repoRoot) {
  const allowlist = parseGitleaksAllowlist(repoRoot);
  const files = listScannableRepoFiles(repoRoot);
  const findings = [];
  for (const file of files) {
    const content = fs.readFileSync(file.fullPath, 'utf8');
    findings.push(...scanSecretsContent(file.rel, content, allowlist));
  }
  return { filesCount: files.length, findings };
}

function globToRegExp(glob) {
  const cleaned = glob.replace(/^\/+/, '').replace(/\/+$/, '');
  let regexStr = '^';
  let i = 0;
  while (i < cleaned.length) {
    if (cleaned.startsWith('**/', i)) {
      regexStr += '(?:.+/)?';
      i += 3;
    } else if (cleaned.startsWith('**', i)) {
      regexStr += '.*';
      i += 2;
    } else if (cleaned[i] === '*') {
      regexStr += '[^/]*';
      i += 1;
    } else {
      regexStr += cleaned[i].replace(/[.+?^${}()|[\]\\]/g, String.raw`\$&`);
      i += 1;
    }
  }
  regexStr += '(?:/.*)?$';
  return new RegExp(regexStr);
}

function parseDockerignore(repoRoot) {
  const ignorePath = path.join(repoRoot, '.dockerignore');
  if (!fs.existsSync(ignorePath)) {
    return [];
  }
  const rules = [];
  for (const rawLine of fs.readFileSync(ignorePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const negated = line.startsWith('!');
    const pattern = negated ? line.slice(1).trim() : line;
    if (pattern) {
      rules.push({ negated, regex: globToRegExp(pattern) });
    }
  }
  return rules;
}

function isDockerIgnored(rel, rules) {
  const normalized = rel.replaceAll('\\', '/').replace(/\/+$/, '');
  let ignored = false;
  for (const rule of rules) {
    if (rule.regex.test(normalized)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

function parseCopyInstruction(rest) {
  const tokens = rest.split(/\s+/).filter(Boolean);
  let fromStage = '';
  const positional = [];
  for (const token of tokens) {
    if (token.startsWith('--from=')) {
      fromStage = token.slice('--from='.length);
    } else if (!token.startsWith('--')) {
      positional.push(token);
    }
  }
  const dest = positional.at(-1) ?? '';
  const sources = positional.slice(0, -1);
  return { fromStage, sources, dest };
}

export function parseDockerfileStages(dockerfileContent) {
  const folded = dockerfileContent.replaceAll(/\\\r?\n/g, ' ');
  const stages = [];
  let current = null;

  for (const rawLine of folded.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const spaceIdx = line.search(/\s/);
    const instruction = (spaceIdx === -1 ? line : line.slice(0, spaceIdx)).toUpperCase();
    const rest = spaceIdx === -1 ? '' : line.slice(spaceIdx).trim();

    if (instruction === 'FROM') {
      const asMatch = /\bAS\s+([^\s]+)/i.exec(rest);
      current = {
        name: asMatch?.[1] ?? `stage-${stages.length}`,
        base: rest,
        copies: [],
        runs: [],
        user: '',
        healthcheck: '',
        envs: [],
      };
      stages.push(current);
      continue;
    }
    if (!current) {
      continue;
    }
    if (instruction === 'COPY') {
      current.copies.push(parseCopyInstruction(rest));
    } else if (instruction === 'RUN') {
      current.runs.push({ command: rest, copyIndex: current.copies.length });
    } else if (instruction === 'USER') {
      current.user = rest;
    } else if (instruction === 'HEALTHCHECK') {
      current.healthcheck = rest;
    } else if (instruction === 'ENV') {
      current.envs.push(rest);
    }
  }

  return stages;
}

function copyIntoSimDir(repoRoot, srcRaw, destRaw, simDir, packageJsonOverride) {
  const cleanSrc = srcRaw.replace(/^\.\//, '').replace(/\/+$/, '');
  const absSrc = path.join(repoRoot, cleanSrc);
  const cleanDest = destRaw.replace(/^\.\//, '');
  const destIsDir = destRaw === '.' || destRaw === './' || destRaw.endsWith('/');

  if (fs.statSync(absSrc).isDirectory()) {
    const targetDir = cleanDest ? path.join(simDir, cleanDest) : simDir;
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.cpSync(absSrc, targetDir, { recursive: true });
    return;
  }

  const targetFile = destIsDir
    ? path.join(simDir, cleanDest, path.basename(cleanSrc))
    : path.join(simDir, cleanDest);
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });

  if (cleanSrc === 'package.json' && packageJsonOverride) {
    fs.writeFileSync(targetFile, JSON.stringify(packageJsonOverride, null, 2), 'utf8');
    return;
  }
  fs.copyFileSync(absSrc, targetFile);
}

function simulateStageNpmLifecycle(repoRoot, stage, runEntry, packageJsonOverride) {
  const simDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-docker-sim-'));
  const stageErrors = [];
  try {
    const activeCopies = stage.copies
      .slice(0, runEntry.copyIndex)
      .filter((entry) => !entry.fromStage);
    for (const copyEntry of activeCopies) {
      for (const src of copyEntry.sources) {
        copyIntoSimDir(repoRoot, src, copyEntry.dest, simDir, packageJsonOverride);
      }
    }

    const pkgPath = path.join(simDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      stageErrors.push(`Docker stage "${stage.name}" runs npm ci without root package.json.`);
      return stageErrors;
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const scripts = pkg.scripts ?? {};
    for (const hook of LIFECYCLE_HOOKS) {
      const cmd = scripts[hook];
      if (!cmd) {
        continue;
      }
      const res = spawnSync(cmd, { cwd: simDir, shell: true, encoding: 'utf8' });
      if (res.status !== 0) {
        const errSnippet = (res.stderr || res.stdout || '').trim().slice(0, 240);
        stageErrors.push(
          `Docker stage "${stage.name}" failed root lifecycle hook "${hook}" (exit=${res.status}): ${errSnippet}`,
        );
      }
    }
  } finally {
    fs.rmSync(simDir, { recursive: true, force: true });
  }
  return stageErrors;
}

export function validateApiDockerfileBuildContext(repoRoot, options = {}) {
  const dockerfilePath = path.join(repoRoot, 'infra', 'docker', 'api.Dockerfile');
  if (!fs.existsSync(dockerfilePath)) {
    return ['Missing infra/docker/api.Dockerfile.'];
  }

  const stages = parseDockerfileStages(fs.readFileSync(dockerfilePath, 'utf8'));
  const ignoreRules = parseDockerignore(repoRoot);
  const errors = [];

  for (const requiredStage of ['builder', 'prod-deps', 'runner']) {
    if (!stages.some((stage) => stage.name === requiredStage)) {
      errors.push(`api.Dockerfile missing required stage "${requiredStage}".`);
    }
  }

  const runner = stages.find((stage) => stage.name === 'runner');
  if (runner) {
    if (runner.user.trim() !== 'node') {
      errors.push(`api.Dockerfile runner stage must set USER node (got "${runner.user}").`);
    }
    if (!runner.envs.some((env) => env.includes('NODE_ENV=production'))) {
      errors.push('api.Dockerfile runner stage must set ENV NODE_ENV=production.');
    }
    if (!runner.healthcheck) {
      errors.push('api.Dockerfile runner stage must declare HEALTHCHECK.');
    }
  }

  for (const stage of stages) {
    for (const copyEntry of stage.copies) {
      if (copyEntry.fromStage) {
        continue;
      }
      for (const src of copyEntry.sources) {
        const cleanSrc = src.replace(/^\.\//, '').replace(/\/+$/, '');
        if (!fs.existsSync(path.join(repoRoot, cleanSrc))) {
          errors.push(`api.Dockerfile stage "${stage.name}" COPY source not found: ${src}`);
        } else if (isDockerIgnored(cleanSrc, ignoreRules)) {
          errors.push(`api.Dockerfile stage "${stage.name}" COPY source is ignored by .dockerignore: ${src}`);
        }
      }
    }

    for (const runEntry of stage.runs) {
      if (/npm\s+ci\b/.test(runEntry.command) && runEntry.command.includes('--ignore-scripts')) {
        errors.push(`api.Dockerfile stage "${stage.name}" must not pass --ignore-scripts to npm ci.`);
      }
      if (/npm\s+ci\b/.test(runEntry.command) && runEntry.command.includes('--include-workspace-root')) {
        errors.push(
          ...simulateStageNpmLifecycle(repoRoot, stage, runEntry, options.packageJsonOverride),
        );
      }
    }
  }

  return errors;
}

export function validatePrismaSchema(repoRoot) {
  const schemaPath = path.join(repoRoot, 'apps', 'api', 'prisma', 'schema.prisma');
  const migrationsDir = path.join(repoRoot, 'apps', 'api', 'prisma', 'migrations');
  const errors = [];

  if (!fs.existsSync(schemaPath)) {
    return ['Missing apps/api/prisma/schema.prisma.'];
  }
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  if (!schemaContent.includes('directUrl = env("DATABASE_URL_UNPOOLED")')) {
    errors.push('schema.prisma must configure directUrl = env("DATABASE_URL_UNPOOLED").');
  }

  if (!fs.existsSync(migrationsDir)) {
    errors.push('Missing apps/api/prisma/migrations directory.');
  } else {
    const dirs = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    let previousTimestamp = '';
    for (const dirName of dirs) {
      if (!/^\d{14}_[a-z0-9_]+$/.test(dirName)) {
        errors.push(`Invalid Prisma migration folder name: ${dirName}`);
        continue;
      }
      const timestamp = dirName.slice(0, 14);
      if (previousTimestamp && timestamp <= previousTimestamp) {
        errors.push(`Prisma migrations out of chronological order at ${dirName}`);
      }
      previousTimestamp = timestamp;
      const sqlPath = path.join(migrationsDir, dirName, 'migration.sql');
      if (!fs.existsSync(sqlPath) || fs.readFileSync(sqlPath, 'utf8').trim().length === 0) {
        errors.push(`Prisma migration missing non-empty migration.sql: ${dirName}`);
      }
    }
  }

  const prismaCliCandidates = [
    path.join(repoRoot, 'node_modules', 'prisma', 'build', 'index.js'),
    path.join(repoRoot, 'apps', 'api', 'node_modules', 'prisma', 'build', 'index.js'),
  ];
  const prismaCli = prismaCliCandidates.find((candidate) => fs.existsSync(candidate));
  if (!prismaCli) {
    errors.push('Unable to locate local Prisma CLI (node_modules/prisma/build/index.js).');
    return errors;
  }

  try {
    execFileSync(process.execPath, [prismaCli, 'validate', '--schema', schemaPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL || 'postgresql://mock:mock@127.0.0.1:5432/mock',
        DATABASE_URL_UNPOOLED:
          process.env.DATABASE_URL_UNPOOLED || 'postgresql://mock:mock@127.0.0.1:5432/mock',
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = String(error?.stderr || error?.stdout || error?.message || error).trim();
    errors.push(`prisma validate failed: ${detail.slice(0, 400)}`);
  }

  return errors;
}

export function validateDeployWorkflowAndEdgeConfig(repoRoot) {
  const errors = [];
  const deployPath = path.join(repoRoot, '.github', 'workflows', 'deploy.yml');
  if (!fs.existsSync(deployPath)) {
    errors.push('Missing .github/workflows/deploy.yml.');
  } else {
    const deployYml = fs.readFileSync(deployPath, 'utf8');
    for (const token of [
      'docker build -f infra/docker/api.Dockerfile',
      'prisma migrate deploy',
      'id: db-secret',
      'npm run audit:ui',
      'needs: deploy-api-azure',
      'wrangler-action',
    ]) {
      if (!deployYml.includes(token)) {
        errors.push(`deploy.yml missing required invariant: ${token}`);
      }
    }
    for (const line of deployYml.split(/\r?\n/)) {
      if (/^\s*if:/.test(line) && line.includes('secrets.')) {
        errors.push(`deploy.yml must not reference secrets.* inside an if: condition -> ${line.trim()}`);
      }
    }
  }

  const headersPath = path.join(repoRoot, 'apps', 'web', 'public', '_headers');
  if (!fs.existsSync(headersPath)) {
    errors.push('Missing apps/web/public/_headers.');
  } else {
    const headersText = fs.readFileSync(headersPath, 'utf8');
    for (const directive of [
      'Strict-Transport-Security:',
      'X-Content-Type-Options: nosniff',
      'Content-Security-Policy:',
    ]) {
      if (!headersText.includes(directive)) {
        errors.push(`apps/web/public/_headers missing ${directive}`);
      }
    }
  }

  const routesPath = path.join(repoRoot, 'apps', 'web', 'public', '_routes.json');
  if (!fs.existsSync(routesPath)) {
    errors.push('Missing apps/web/public/_routes.json.');
  } else {
    try {
      const parsed = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
      if (!Array.isArray(parsed.include) || parsed.include.length === 0) {
        errors.push('apps/web/public/_routes.json must define non-empty include array.');
      }
      if (!Array.isArray(parsed.exclude)) {
        errors.push('apps/web/public/_routes.json must define exclude array.');
      }
    } catch (error) {
      errors.push(`Invalid JSON in apps/web/public/_routes.json: ${error?.message ?? error}`);
    }
  }

  return errors;
}

function runCli() {
  const args = new Set(process.argv.slice(2));
  const runAll = args.size === 0 || args.has('--all');
  const failures = [];

  if (runAll || args.has('--secrets')) {
    const { filesCount, findings } = scanRepositorySecrets(REPO_ROOT);
    if (findings.length > 0) {
      for (const f of findings) {
        failures.push(`[secrets:${f.rule}] ${f.file}:${f.line}`);
      }
    } else {
      console.log(`[ci-parity:secrets] PASSED: 0 secret findings across ${filesCount} files.`);
    }
  }

  if (runAll || args.has('--prisma')) {
    const prismaErrors = validatePrismaSchema(REPO_ROOT);
    if (prismaErrors.length > 0) {
      failures.push(...prismaErrors.map((e) => `[prisma] ${e}`));
    } else {
      console.log('[ci-parity:prisma] PASSED: schema.prisma & migrations validated.');
    }
  }

  if (runAll || args.has('--docker-sim')) {
    const dockerErrors = validateApiDockerfileBuildContext(REPO_ROOT);
    if (dockerErrors.length > 0) {
      failures.push(...dockerErrors.map((e) => `[docker-sim] ${e}`));
    } else {
      console.log('[ci-parity:docker-sim] PASSED: Dockerfile context & npm lifecycle hooks valid.');
    }
  }

  if (runAll || args.has('--deploy')) {
    const deployErrors = validateDeployWorkflowAndEdgeConfig(REPO_ROOT);
    if (deployErrors.length > 0) {
      failures.push(...deployErrors.map((e) => `[deploy-config] ${e}`));
    } else {
      console.log('[ci-parity:deploy] PASSED: deploy.yml & Cloudflare edge headers/routes valid.');
    }
  }

  if (failures.length > 0) {
    console.error('[ci-parity] FAILED:');
    for (const msg of failures) {
      console.error(`  - ${msg}`);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runCli();
}
