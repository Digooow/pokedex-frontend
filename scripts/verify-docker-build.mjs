import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { validateApiDockerfileBuildContext } from './ci-parity-checks.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

function main() {
  const args = new Set(process.argv.slice(2));
  const requireDocker = args.has('--require-docker') || process.env.CI === 'true';

  const contextErrors = validateApiDockerfileBuildContext(REPO_ROOT);
  if (contextErrors.length > 0) {
    console.error('[docker-gate] FAILED Dockerfile build-context & lifecycle simulation:');
    for (const error of contextErrors) {
      console.error(`  - ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  const probe = spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 5000 });
  if (probe.status !== 0) {
    if (requireDocker) {
      console.error('[docker-gate] FAILED: Docker daemon is not running and --require-docker/CI is set.');
      process.exitCode = 1;
      return;
    }
    console.warn(
      '[docker-gate] Docker daemon offline — isolated Dockerfile build-context & lifecycle simulation PASSED (start Docker Desktop or pass --require-docker to also build the full image).',
    );
    return;
  }

  console.log('[docker-gate] Running real Docker build for infra/docker/api.Dockerfile...');
  const build = spawnSync(
    'docker',
    ['build', '-f', 'infra/docker/api.Dockerfile', '-t', 'pokeverse-api:local-check', '.'],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  );
  if (build.status !== 0) {
    console.error(`[docker-gate] FAILED: docker build exited with status ${build.status ?? 1}.`);
    process.exitCode = 1;
    return;
  }
  console.log('[docker-gate] PASSED: Dockerfile build-context simulation + docker build succeeded.');
}

main();
