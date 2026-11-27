import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const DEFAULT_CONCURRENCY = 4;
const PUSH_STAMP_FILENAME = '.pokeverse-verify-push-stamp';

export const TEST_CI_WAVES = [
  ['test:quality-gates', 'test:unit:shared', 'test:unit:api', 'test:unit:web'],
];

export const TEST_LOCAL_WAVES = [
  ['audit:secrets', 'audit:prisma', 'format:check', 'build:shared'],
  [
    'typecheck:shared',
    'typecheck:api',
    'typecheck:web',
    'lint:shared',
    'lint:api',
    'lint:web',
    'audit:duplication',
    'test:quality-gates',
    'test:unit:shared',
    'test:unit:api',
    'test:unit:web',
  ],
];

export const PUSH_WAVES = [
  [
    'audit:secrets',
    'audit:prisma',
    'format:check',
    'audit:deps',
    'build:shared',
  ],
  [
    'typecheck:shared',
    'typecheck:api',
    'typecheck:web',
    'lint:shared',
    'lint:api',
    'lint:web',
    'audit:duplication',
    'test:quality-gates',
    'test:unit:shared',
    'test:unit:api',
    'test:unit:web',
    'test:e2e:api',
    'build:api',
  ],
  ['build:web'],
  ['audit:ui', 'test:e2e:web', 'audit:docker'],
];

export function getWavesForMode(mode, isCi = process.env.CI === 'true') {
  if (mode === 'test') {
    return isCi ? TEST_CI_WAVES : TEST_LOCAL_WAVES;
  }
  if (mode === 'push') {
    return PUSH_WAVES;
  }
  throw new Error(
    `Unsupported --mode="${mode}". Expected "test" or "push".`,
  );
}

export function getAllStagesForMode(mode, isCi = process.env.CI === 'true') {
  return getWavesForMode(mode, isCi).flat();
}

export function resolveNpmInvocation() {
  const npmExecPath = process.env.npm_execpath?.trim();
  if (
    npmExecPath &&
    /\.(?:c|m)?js$/i.test(npmExecPath) &&
    fs.existsSync(npmExecPath)
  ) {
    return {
      bin: process.execPath,
      prefixArgs: [npmExecPath],
      shell: false,
    };
  }

  const bundledNpmCli = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  if (fs.existsSync(bundledNpmCli)) {
    return {
      bin: process.execPath,
      prefixArgs: [bundledNpmCli],
      shell: false,
    };
  }

  return {
    bin: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    prefixArgs: [],
    shell: process.platform === 'win32',
  };
}

function getCleanHeadTreeSha(repoRoot) {
  if (!fs.existsSync(path.join(repoRoot, '.git'))) {
    return '';
  }
  try {
    const dirtyTracked = execFileSync(
      'git',
      ['status', '--porcelain', '--untracked-files=no'],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (dirtyTracked.length > 0) {
      return '';
    }
    return execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function runSingleStage(stage, label, npmInvocation, repoRoot) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    console.log(`[verify:${label}] ▶ ${stage}`);

    const child = spawn(
      npmInvocation.bin,
      [...npmInvocation.prefixArgs, 'run', stage],
      {
        cwd: repoRoot,
        shell: npmInvocation.shell,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    const chunks = [];
    child.stdout?.on('data', (chunk) => chunks.push(chunk));
    child.stderr?.on('data', (chunk) => chunks.push(chunk));

    child.on('error', (err) => {
      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      resolve({
        stage,
        ok: false,
        code: 1,
        elapsedSec,
        output: err.message,
      });
    });

    child.on('close', (code) => {
      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      const output = Buffer.concat(chunks).toString('utf8');
      resolve({
        stage,
        ok: code === 0,
        code: code ?? 1,
        elapsedSec,
        output,
      });
    });
  });
}

async function runWave(
  stages,
  label,
  concurrency,
  npmInvocation,
  repoRoot,
) {
  if (stages.length === 0) {
    return;
  }

  let nextIndex = 0;
  let failed = false;
  const failures = [];
  const workerCount = Math.min(concurrency, stages.length);

  async function worker() {
    while (!failed && nextIndex < stages.length) {
      const idx = nextIndex;
      nextIndex += 1;
      const stage = stages[idx];
      const result = await runSingleStage(stage, label, npmInvocation, repoRoot);
      if (result.ok) {
        console.log(`[verify:${label}] ✓ ${stage} (${result.elapsedSec}s)`);
      } else {
        failed = true;
        console.error(
          `[verify:${label}] ✗ ${stage} failed (exit=${result.code}, ${result.elapsedSec}s)`,
        );
        if (result.output.trim()) {
          console.error(result.output.trimEnd());
        }
        failures.push(result);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (failures.length > 0) {
    const names = failures.map((item) => item.stage).join(', ');
    throw new Error(`Stage failure in ${names}`);
  }
}

function parseCliArgs(argv) {
  let mode = 'test';
  let noCache = false;
  let concurrency = DEFAULT_CONCURRENCY;

  for (const arg of argv) {
    if (arg.startsWith('--mode=')) {
      mode = arg.slice('--mode='.length).trim();
    } else if (arg === '--no-cache') {
      noCache = true;
    } else if (arg.startsWith('--concurrency=')) {
      const parsed = Number.parseInt(arg.slice('--concurrency='.length), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        concurrency = parsed;
      }
    }
  }

  return { mode, noCache, concurrency };
}

export async function runVerifySuite({
  mode = 'test',
  noCache = false,
  concurrency = DEFAULT_CONCURRENCY,
  repoRoot = REPO_ROOT,
  isCi = process.env.CI === 'true',
} = {}) {
  const waves = getWavesForMode(mode, isCi);
  const stampPath = path.join(repoRoot, '.git', PUSH_STAMP_FILENAME);
  const cleanTreeSha =
    mode === 'push' && !isCi ? getCleanHeadTreeSha(repoRoot) : '';

  if (
    mode === 'push' &&
    !noCache &&
    !isCi &&
    cleanTreeSha &&
    fs.existsSync(stampPath)
  ) {
    const cachedSha = fs.readFileSync(stampPath, 'utf8').trim();
    if (cachedSha === cleanTreeSha) {
      console.log(
        `[verify:push] PASSED (cached for tree ${cleanTreeSha.slice(0, 8)} — already verified). Pass --no-cache to re-run.`,
      );
      return true;
    }
  }

  const startedAt = Date.now();
  const npmInvocation = resolveNpmInvocation();

  for (const wave of waves) {
    await runWave(wave, mode, concurrency, npmInvocation, repoRoot);
  }

  if (
    mode === 'push' &&
    !isCi &&
    cleanTreeSha &&
    fs.existsSync(path.join(repoRoot, '.git'))
  ) {
    fs.writeFileSync(stampPath, `${cleanTreeSha}\n`, 'utf8');
  }

  const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const totalStages = waves.reduce((sum, wave) => sum + wave.length, 0);
  console.log(
    `[verify:${mode}] PASSED all ${totalStages} stage(s) in ${totalSec}s.`,
  );
  return true;
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const options = parseCliArgs(process.argv.slice(2));
  runVerifySuite(options).catch((error) => {
    console.error(`[verify:${options.mode}] FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
