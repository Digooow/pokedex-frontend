import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

function main() {
  if (!fs.existsSync(path.join(REPO_ROOT, '.git'))) {
    return;
  }

  try {
    const current = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (current === '.githooks') {
      return;
    }
  } catch {
    // core.hooksPath not configured yet
  }

  try {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
    console.log('[git-hooks] Configured core.hooksPath=.githooks');
  } catch {
    // Gracefully skip when git binary is unavailable (e.g. Docker container builds)
  }
}

main();
