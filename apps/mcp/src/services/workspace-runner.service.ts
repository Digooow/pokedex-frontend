import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const ALLOWED_WORKSPACE_CHECKS = [
  'typecheck:shared',
  'typecheck:web',
  'typecheck:mcp',
  'lint:web',
  'lint:mcp',
  'audit:duplication',
  'test:quality-gates',
  'test:unit:shared',
  'test:unit:web',
  'test:unit:mcp',
  'build:web',
  'build:mcp',
] as const;

export type AllowedWorkspaceCheck = (typeof ALLOWED_WORKSPACE_CHECKS)[number];

const MAX_OUTPUT_CHARS = 12_000;
const CHECK_TIMEOUT_MS = 120_000;

function resolveNpmCli(repoRoot: string): { readonly bin: string; readonly prefix: string[] } {
  const bundled = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  if (fs.existsSync(bundled)) {
    return { bin: process.execPath, prefix: [bundled] };
  }
  const localNpm = path.join(repoRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (fs.existsSync(localNpm)) {
    return { bin: process.execPath, prefix: [localNpm] };
  }
  return {
    bin: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    prefix: [],
  };
}

function truncateTail(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= MAX_OUTPUT_CHARS) {
    return trimmed;
  }
  return `...(truncated)...\n${trimmed.slice(-MAX_OUTPUT_CHARS)}`;
}

export async function runAllowlistedWorkspaceCheck(
  repoRoot: string,
  checkName: AllowedWorkspaceCheck,
): Promise<{
  readonly script: AllowedWorkspaceCheck;
  readonly ok: boolean;
  readonly output: string;
}> {
  const { bin, prefix } = resolveNpmCli(repoRoot);
  try {
    const { stdout, stderr } = await execFileAsync(bin, [...prefix, 'run', checkName], {
      cwd: repoRoot,
      timeout: CHECK_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
      shell: false,
    });
    return {
      script: checkName,
      ok: true,
      output: truncateTail(`${stdout}\n${stderr}`),
    };
  } catch (error) {
    const errObj = error as {
      readonly stdout?: string;
      readonly stderr?: string;
      readonly message?: string;
    };
    const combined = `${errObj.stdout ?? ''}\n${errObj.stderr ?? ''}\n${errObj.message ?? ''}`;
    return {
      script: checkName,
      ok: false,
      output: truncateTail(combined),
    };
  }
}
