import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ESLint } from 'eslint';
import {
  parseGitleaksAllowlist,
  scanRepositorySecrets,
  scanSecretsContent,
  validateApiDockerfileBuildContext,
  validateDeployWorkflowAndEdgeConfig,
  validatePrismaSchema,
} from './ci-parity-checks.mjs';
import {
  getAllStagesForMode,
} from './run-verify-suite.mjs';
import {
  checkHtmlParity,
  checkScssParity,
  checkSuppressionBypass,
  checkTypeScriptParity,
  formatParityFinding,
  scanRepositoryParity,
} from './sonar-parity-rules.mjs';
import {
  hasPrismaChanges,
  isParityTrackedFile,
  isPrettierTrackedFile,
} from './verify-commit-fast.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const WEB_DIR = path.join(REPO_ROOT, 'apps', 'web');
const WEB_SRC_VIRTUAL = path.join(WEB_DIR, 'src', 'app', 'core', 'stores', 'auth.store.ts');
const WEB_SPEC_VIRTUAL = path.join(WEB_DIR, 'src', 'app', 'core', 'stores', 'auth-iam.spec.ts');

let webEslint;
async function getWebEslint() {
  if (!webEslint) {
    webEslint = new ESLint({ cwd: WEB_DIR });
  }
  return webEslint;
}

async function lintWebSnippet(code, filePath = WEB_SRC_VIRTUAL) {
  const eslint = await getWebEslint();
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.severity === 2) ?? [];
}

function assertHasRule(findings, ruleId) {
  assert.ok(
    findings.some((f) => f.rule === ruleId),
    `Expected rule ${ruleId}, got: ${JSON.stringify(findings)}`,
  );
}

test('Suite 1 — SonarCloud Parity Engine: TypeScript rules (S6582, S7747, S7763, S7758, S7766, S7727, S7649, S7781, S7780, suppression)', () => {
  assertHasRule(
    checkTypeScriptParity('apps/web/src/a.ts', 'if (active && active.name === q) {}'),
    'typescript:S6582',
  );
  assert.equal(
    checkTypeScriptParity('apps/web/src/a.ts', 'if (active?.name === q) {}').length,
    0,
  );
  assert.equal(
    checkTypeScriptParity('apps/web/src/a.ts', 'if (active && active.x !== y) {}').length,
    0,
  );

  assertHasRule(
    checkTypeScriptParity('apps/web/src/a.ts', 'for (const c of [...group.children]) {}'),
    'typescript:S7747',
  );
  assertHasRule(
    checkTypeScriptParity('apps/web/src/a.ts', 'for (const c of Array.from(set)) {}'),
    'typescript:S7747',
  );
  assert.equal(
    checkTypeScriptParity('apps/web/src/a.ts', 'for (const item of new Set(list)) {}').length,
    0,
  );

  assertHasRule(
    checkTypeScriptParity(
      'apps/web/e2e/fixture.spec.ts',
      "import { expect } from '@playwright/test';\nexport { expect };",
    ),
    'typescript:S7763',
  );
  assert.equal(
    checkTypeScriptParity(
      'apps/web/e2e/fixture.spec.ts',
      "export { expect } from '@playwright/test';",
    ).length,
    0,
  );

  assertHasRule(
    checkTypeScriptParity('apps/web/src/a.ts', 'const code = token.charCodeAt(0);'),
    'typescript:S7758',
  );
  assert.equal(
    checkTypeScriptParity('apps/web/src/a.ts', 'const code = token.codePointAt(0);').length,
    0,
  );

  assertHasRule(
    checkTypeScriptParity('apps/web/src/a.ts', 'return idx >= 0 ? idx : 0;'),
    'typescript:S7766',
  );
  assert.equal(
    checkTypeScriptParity('apps/web/src/a.ts', 'return Math.max(idx, 0);').length,
    0,
  );

  assertHasRule(
    checkTypeScriptParity('apps/web/src/a.ts', 'const out = items.map(formatPokeApiText);'),
    'typescript:S7727',
  );
  assert.equal(
    checkTypeScriptParity(
      'apps/web/src/a.ts',
      'const out = items.map((item) => formatPokeApiText(item)).filter(Boolean);',
    ).length,
    0,
  );

  assertHasRule(
    checkTypeScriptParity(
      'apps/web/src/a.directive.ts',
      "readonly order = input(0, { alias: 'pvOrder' });",
    ),
    'typescript:S7649',
  );
  assertHasRule(
    checkTypeScriptParity('apps/web/src/a.directive.ts', "@Input('pvOrder') order = 0;"),
    'typescript:S7649',
  );
  assert.equal(
    checkTypeScriptParity('apps/web/src/a.directive.ts', 'readonly pvOrder = input(0);').length,
    0,
  );

  assertHasRule(
    checkTypeScriptParity('apps/api/src/a.ts', "const slug = raw.replace(/ /g, '-');"),
    'typescript:S7781',
  );
  assert.equal(
    checkTypeScriptParity(
      'apps/api/src/a.ts',
      "const slug = raw.replaceAll(' ', '-').replace(/\\s+/g, '-');",
    ).length,
    0,
  );

  assertHasRule(
    checkTypeScriptParity(
      'apps/web/src/a.ts',
      "const bin = 'C:\\\\Program Files\\\\Chrome\\\\chrome.exe';",
    ),
    'typescript:S7780',
  );
  assert.equal(
    checkTypeScriptParity(
      'apps/web/src/a.ts',
      "const bin = String.raw`C:\\Program Files\\Chrome\\chrome.exe`;\nconst norm = p.replaceAll('\\\\', '/');",
    ).length,
    0,
  );

  assertHasRule(
    checkSuppressionBypass('apps/web/src/a.ts', 'const x = 1; // NOSONAR'),
    'policy:no-suppression',
  );
  assertHasRule(
    checkSuppressionBypass('apps/web/src/a.ts', '/* cpd-ignore */'),
    'policy:no-suppression',
  );
  assert.equal(
    checkSuppressionBypass('apps/web/src/a.ts', 'const clean = true;').length,
    0,
  );
});

test('Suite 1 — SonarCloud Parity Engine: HTML rules (Web:S6819, S1082, S6825, S6843, S6853, S7927)', () => {
  assertHasRule(
    checkHtmlParity('apps/web/src/a.html', '<div role="region" aria-label="Calc"></div>'),
    'Web:S6819',
  );
  assert.equal(
    checkHtmlParity(
      'apps/web/src/a.html',
      '<section aria-label="Calc"></section><div [attr.role]="open ? \'dialog\' : null"></div>',
    ).length,
    0,
  );

  assertHasRule(
    checkHtmlParity('apps/web/src/a.html', '<div class="backdrop" (click)="close()"></div>'),
    'Web:S1082',
  );
  assert.equal(
    checkHtmlParity(
      'apps/web/src/a.html',
      '<button type="button" (click)="close()"></button><div (click)="focus()" (keydown)="onKey($event)"></div>',
    ).length,
    0,
  );

  assertHasRule(
    checkHtmlParity('apps/web/src/a.html', '<canvas tabindex="0" aria-hidden="true"></canvas>'),
    'Web:S6825',
  );
  assert.equal(
    checkHtmlParity('apps/web/src/a.html', '<canvas aria-hidden="true"></canvas>').length,
    0,
  );

  assertHasRule(
    checkHtmlParity('apps/web/src/a.html', '<button type="button" role="presentation">X</button>'),
    'Web:S6843',
  );
  assert.equal(
    checkHtmlParity('apps/web/src/a.html', '<button type="button">X</button>').length,
    0,
  );

  assertHasRule(
    checkHtmlParity(
      'apps/web/src/a.html',
      '<label><span>Busca</span><input type="text" /><button type="submit">Ir</button></label>',
    ),
    'Web:S6853',
  );
  assertHasRule(
    checkHtmlParity('apps/web/src/a.html', '<label>Sem for nem input</label>'),
    'Web:S6853',
  );
  assert.equal(
    checkHtmlParity(
      'apps/web/src/a.html',
      '<label for="q">Busca</label><input id="q" /><label [for]="\'id-\' + side">Lado</label>',
    ).length,
    0,
  );

  assertHasRule(
    checkHtmlParity('apps/web/src/a.html', '<select id="x" aria-label="Perfil"></select>'),
    'Web:S7927',
  );
  assertHasRule(
    checkHtmlParity(
      'apps/web/src/a.html',
      '<button type="button" aria-label="Abrir">Detalhes</button>',
    ),
    'Web:S7927',
  );
  assert.equal(
    checkHtmlParity(
      'apps/web/src/a.html',
      '<label for="x" class="sr-only-static">Perfil</label><select id="x"></select><button type="button" aria-label="Detalhes do Pikachu">Detalhes</button>',
    ).length,
    0,
  );
});

test('Suite 1 — SonarCloud Parity Engine: SCSS rules (css:S9440, css:S4656, css:S4666)', () => {
  assertHasRule(
    checkScssParity('apps/web/src/app/x.scss', '.modal { transition: opacity 0.2s; }'),
    'css:S9440',
  );
  assert.equal(
    checkScssParity(
      'apps/web/src/app/x.scss',
      '.modal { transition: opacity 0.2s; }\n@media (prefers-reduced-motion: reduce) { .modal { transition: none; } }',
    ).length,
    0,
  );

  assertHasRule(
    checkScssParity('apps/web/src/styles/a.scss', '.box { display: flex; gap: 4px; gap: 8px; }'),
    'css:S4656',
  );
  assert.equal(
    checkScssParity('apps/web/src/styles/a.scss', '.box { display: flex; gap: 8px; }').length,
    0,
  );

  assertHasRule(
    checkScssParity(
      'apps/web/src/styles/a.scss',
      '.btn-secundario { color: red; }\n.other { color: blue; }\n.btn-secundario { gap: 4px; }',
    ),
    'css:S4666',
  );
  assert.equal(
    checkScssParity(
      'apps/web/src/styles/a.scss',
      '.btn-secundario { color: red; }\n@media (max-width: 768px) { .btn-secundario { gap: 4px; } }\n:root { --pv-type-#{$type}-bg: red; }',
    ).length,
    0,
  );
});

test('Suite 2 — Real ESLint + SonarJS AST catches all historical JS/TS SonarCloud & Prettier errors', async () => {
  const cases = [
    {
      name: 'typescript:S9382 (no-await-in-loop)',
      rule: 'no-await-in-loop',
      code: 'export async function runLoop(ids: string[]): Promise<void> {\n  for (const id of ids) {\n    await Promise.resolve(id);\n  }\n}\n',
    },
    {
      name: 'typescript:S3358 (nested ternary in source)',
      rule: 'sonarjs/no-nested-conditional',
      code: 'export function pick(a: boolean, b: boolean): number {\n  return a ? 1 : b ? 2 : 3;\n}\n',
    },
    {
      name: 'typescript:S3358 (nested ternary in spec)',
      rule: 'sonarjs/no-nested-conditional',
      filePath: WEB_SPEC_VIRTUAL,
      code: 'export function pickSpec(a: boolean, b: boolean): number {\n  return a ? 1 : b ? 2 : 3;\n}\n',
    },
    {
      name: 'typescript:S3776 (cognitive-complexity)',
      rule: 'sonarjs/cognitive-complexity',
      code: [
        'export function complex(a: number, b: number, c: number, d: number, e: number): number {',
        '  let total = 0;',
        '  if (a > 0) {',
        '    for (let i = 0; i < b; i += 1) {',
        '      if (i % 2 === 0) {',
        '        total += c > 0 ? (d > 0 ? e : 1) : 2;',
        '      } else if (d > 3) {',
        '        while (total < 10) {',
        '          total += e > 0 ? 2 : 1;',
        '        }',
        '      }',
        '    }',
        '  }',
        '  return total;',
        '}',
        '',
      ].join('\n'),
    },
    {
      name: 'typescript:S7503 (require-await)',
      rule: '@typescript-eslint/require-await',
      code: 'export async function noAwait(): Promise<number> {\n  return 42;\n}\n',
    },
    {
      name: 'typescript:S6582 (prefer-optional-chain)',
      rule: '@typescript-eslint/prefer-optional-chain',
      code: 'export function len(x?: { name: string }): number {\n  return x && x.name ? x.name.length : 0;\n}\n',
    },
    {
      name: 'typescript:S2933 (prefer-readonly)',
      rule: '@typescript-eslint/prefer-readonly',
      code: 'export class Holder {\n  private count = 1;\n  getCount(): number {\n    return this.count;\n  }\n}\n',
    },
    {
      name: 'typescript:S8786 (super-linear-regex)',
      rule: 'sonarjs/super-linear-regex',
      code: 'export const BAD_REGEX = /^\\s*(.*)\\s*$/;\n',
    },
    {
      name: 'typescript:S5869 (duplicates-in-character-class)',
      rule: 'sonarjs/duplicates-in-character-class',
      code: 'export const DUP_CHAR = /[a-za]/;\n',
    },
    {
      name: 'typescript:S4624 (no-nested-template-literals)',
      rule: 'sonarjs/no-nested-template-literals',
      code: 'export function tpl(a: string, b: string): string {\n  return `outer-${`inner-${a}`}-${b}`;\n}\n',
    },
    {
      name: 'typescript:S3516 (no-invariant-returns)',
      rule: 'sonarjs/no-invariant-returns',
      code: 'export function same(flag: boolean): number {\n  if (flag) {\n    return 1;\n  }\n  return 1;\n}\n',
    },
    {
      name: 'typescript:S5906 (prefer-specific-assertions)',
      rule: 'sonarjs/prefer-specific-assertions',
      filePath: WEB_SPEC_VIRTUAL,
      code: "it('checks undefined', () => {\n  const val: number | undefined = undefined;\n  expect(val).toBe(undefined);\n});\n",
    },
    {
      name: 'typescript:S107 (max-params)',
      rule: 'max-params',
      code: 'export function tooMany(a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number): number {\n  return a + b + c + d + e + f + g + h;\n}\n',
    },
    {
      name: 'prettier/prettier formatting mismatch',
      rule: 'prettier/prettier',
      code: 'export const   uglyFormatting=1\n',
    },
  ];

  for (const testCase of cases) {
    const messages = await lintWebSnippet(testCase.code, testCase.filePath);
    assert.ok(
      messages.some((m) => m.ruleId === testCase.rule),
      `Expected ESLint rule ${testCase.rule} for "${testCase.name}", got: ${JSON.stringify(messages)}`,
    );
  }
});

test('Suite 3 — Historical CI Pipeline Failure Invariants', () => {
  const ciYml = fs.readFileSync(path.join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.doesNotMatch(
    ciYml,
    /KAFKA_ADVERTISED_LISTENERS:[^\n]*0\.0\.0\.0/,
    'Run 45106052067 regression: KAFKA_ADVERTISED_LISTENERS must never use 0.0.0.0.',
  );

  for (const requiredStep of [
    'gitleaks',
    'npm audit --omit=dev --audit-level=high',
    'npm run typecheck',
    'npm run lint',
    'npm run format:check',
    'npm run audit:duplication',
    'npm run test',
    'npm run build',
    'npm run audit:ui',
    'npm run test:e2e:web',
    'trivy-action',
    'sonarqube:',
    'needs: [verify]',
  ]) {
    assert.ok(ciYml.includes(requiredStep), `Missing CI gate invariant: ${requiredStep}`);
  }

  const uiGate = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'ui-quality-gate.mjs'), 'utf8');
  for (const symbol of [
    'tryCreatePageTarget',
    'probePageTarget',
    'waitForPageTarget',
    "'.wasm': 'application/wasm'",
    'readProductionCspHeader',
    "'Content-Security-Policy'",
  ]) {
    assert.ok(uiGate.includes(symbol), `ui-quality-gate.mjs missing safeguard: ${symbol}`);
  }

  const headersFile = fs.readFileSync(path.join(REPO_ROOT, 'apps', 'web', 'public', '_headers'), 'utf8');
  const cspLine = headersFile
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith('Content-Security-Policy:'));
  assert.ok(cspLine, 'apps/web/public/_headers must define Content-Security-Policy.');
  assert.match(cspLine, /script-src[^;]*'wasm-unsafe-eval'/);
  assert.match(cspLine, /worker-src[^;]*\bblob:/);
  assert.match(cspLine, /img-src[^;]*\bblob:/);
  assert.match(
    cspLine,
    /connect-src[^;]*\bblob:/,
    'connect-src must allow blob: so Three.js ImageBitmapLoader can decode embedded GLB WebP textures.',
  );
  assert.match(cspLine, /connect-src[^;]*https:\/\/pokeapi\.co/);
  assert.match(cspLine, /connect-src[^;]*https:\/\/raw\.githubusercontent\.com/);

  const jestE2e = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'apps', 'api', 'test', 'jest-e2e.json'), 'utf8'),
  );
  assert.ok(
    Array.isArray(jestE2e.setupFiles) && jestE2e.setupFiles.includes('./setup-e2e-env.ts'),
    'Run 45373283111 regression: jest-e2e.json must register ./setup-e2e-env.ts in setupFiles.',
  );
  const setupE2eEnv = fs.readFileSync(
    path.join(REPO_ROOT, 'apps', 'api', 'test', 'setup-e2e-env.ts'),
    'utf8',
  );
  assert.match(setupE2eEnv, /GOOGLE_CLIENT_ID/);
  assert.match(setupE2eEnv, /GOOGLE_CLIENT_SECRET/);

  const pokedexSpecsDir = path.join(REPO_ROOT, 'apps', 'web', 'src', 'app', 'features', 'pokedex-device');
  const specFiles = fs
    .readdirSync(pokedexSpecsDir)
    .filter((name) => name.endsWith('.spec.ts'));
  for (const fileName of specFiles) {
    const content = fs.readFileSync(path.join(pokedexSpecsDir, fileName), 'utf8');
    if (content.includes('PokedexDevicePageComponent')) {
      assert.match(
        content,
        /beforeEach[\s\S]*resetBrowserPreferencesState\(\)/,
        `Run 45909358834 regression: ${fileName} must reset browser preferences in beforeEach.`,
      );
      assert.match(
        content,
        /afterEach[\s\S]*resetBrowserPreferencesState\(\)/,
        `Run 45909358834 regression: ${fileName} must reset browser preferences in afterEach.`,
      );
    }
  }

  const sonarProps = fs.readFileSync(path.join(REPO_ROOT, '.sonarcloud.properties'), 'utf8');
  assert.match(sonarProps, /apps\/api\/prisma\/migrations\/\*\*/);
  assert.match(sonarProps, /apps\/web\/public\/assets\/draco\/\*\*/);
  assert.match(sonarProps, /sonar\.cpd\.exclusions=.*\*\*\/\*\.spec\.ts/);
  assert.match(sonarProps, /sonar\.cpd\.exclusions=.*\*\*\/\*\.e2e-spec\.ts/);
});

test('Suite 4 — Live Codebase SonarCloud Parity Smoke Check', () => {
  const { filesCount, findings } = scanRepositoryParity(REPO_ROOT, ['apps', 'packages']);
  assert.ok(filesCount > 0, 'Expected source files to be scanned.');
  assert.equal(
    findings.length,
    0,
    `Expected 0 parity violations in codebase, found:\n${findings.map((f) => formatParityFinding(f)).join('\n')}`,
  );
});

test('Suite 5 — Local Secret Scanning Parity (Gitleaks gate)', () => {
  const allowlist = parseGitleaksAllowlist(REPO_ROOT);
  const syntheticGithubPat = ['ghp_', 'a'.repeat(36)].join('');
  const syntheticAwsKey = ['AKIA', '1234567890ABCDEF'].join('');
  const syntheticPemHeader = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  const syntheticResendKey = ['re_', '1234567890abcdefghijklmnop'].join('');
  const syntheticSonarToken = ['sqp_', 'a'.repeat(40)].join('');

  assert.equal(
    scanSecretsContent('apps/api/src/a.ts', `const t = '${syntheticGithubPat}';`, allowlist)[0]?.rule,
    'github-pat',
  );
  assert.equal(
    scanSecretsContent('apps/api/src/a.ts', `const k = '${syntheticAwsKey}';`, allowlist)[0]?.rule,
    'aws-access-key',
  );
  assert.equal(
    scanSecretsContent('apps/api/src/a.ts', `const p = '${syntheticPemHeader}';`, allowlist)[0]?.rule,
    'private-key',
  );
  assert.equal(
    scanSecretsContent('apps/api/src/a.ts', `const r = '${syntheticResendKey}';`, allowlist)[0]?.rule,
    'resend-api-key',
  );
  assert.equal(
    scanSecretsContent('apps/api/src/a.ts', `const s = '${syntheticSonarToken}';`, allowlist)[0]?.rule,
    'sonar-token',
  );
  assert.equal(
    scanSecretsContent(
      'apps/api/src/a.ts',
      `const t = '${syntheticGithubPat}'; // gitleaks:allow`,
      allowlist,
    ).length,
    0,
  );
  assert.equal(
    scanSecretsContent('.env.example', `RESEND_API_KEY=${syntheticResendKey}`, allowlist).length,
    0,
  );

  const { filesCount, findings } = scanRepositorySecrets(REPO_ROOT);
  assert.ok(filesCount > 0, 'Expected repository files to be scanned for secrets.');
  assert.equal(
    findings.length,
    0,
    `Expected 0 secret findings in repository, found: ${JSON.stringify(findings)}`,
  );
});

test('Suite 6 — Docker Build Context & Root Lifecycle Simulation (Runs 45942849996 & 45942850091)', () => {
  const realPkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const brokenPkg = {
    ...realPkg,
    scripts: {
      ...realPkg.scripts,
      prepare: 'node scripts/setup-git-hooks.mjs',
    },
  };

  const brokenErrors = validateApiDockerfileBuildContext(REPO_ROOT, {
    packageJsonOverride: brokenPkg,
  });
  assert.ok(
    brokenErrors.some(
      (msg) => (msg.includes('builder') || msg.includes('prod-deps')) && msg.includes('prepare'),
    ),
    `Expected Docker lifecycle simulation to catch missing scripts/ in prepare hook, got: ${JSON.stringify(brokenErrors)}`,
  );

  const realErrors = validateApiDockerfileBuildContext(REPO_ROOT);
  assert.equal(
    realErrors.length,
    0,
    `Expected api.Dockerfile build context & lifecycle simulation to pass, got:\n${realErrors.join('\n')}`,
  );

  const localPrepare = spawnSync(realPkg.scripts.prepare, {
    cwd: REPO_ROOT,
    shell: true,
    encoding: 'utf8',
  });
  assert.equal(
    localPrepare.status,
    0,
    `Expected root prepare script to succeed in repo root, stderr: ${localPrepare.stderr}`,
  );
});

test('Suite 7 — Deploy Workflow, Edge Config, Prisma & Full-Stage Hook Parity', () => {
  const deployErrors = validateDeployWorkflowAndEdgeConfig(REPO_ROOT);
  assert.equal(
    deployErrors.length,
    0,
    `Expected deploy/edge checks to pass, got:\n${deployErrors.join('\n')}`,
  );

  const prismaErrors = validatePrismaSchema(REPO_ROOT);
  assert.equal(
    prismaErrors.length,
    0,
    `Expected Prisma schema & migrations to pass, got:\n${prismaErrors.join('\n')}`,
  );

  assert.equal(isPrettierTrackedFile('apps/web/src/app/app.ts'), true);
  assert.equal(isPrettierTrackedFile('apps/web/playwright.config.ts'), true);
  assert.equal(isPrettierTrackedFile('README.md'), false);
  assert.equal(isParityTrackedFile('apps/web/src/app/app.html'), true);
  assert.equal(
    isParityTrackedFile('apps/api/prisma/migrations/20261118073124_init_pokeverse_schema/migration.sql'),
    false,
  );
  assert.equal(
    isParityTrackedFile('apps/web/public/assets/draco/draco_decoder.js'),
    false,
  );
  assert.equal(isParityTrackedFile('README.md'), false);
  assert.equal(hasPrismaChanges(['apps/api/prisma/schema.prisma']), true);
  assert.equal(hasPrismaChanges(['apps/web/src/main.ts']), false);

  const expectedLocalTestStages = [
    'audit:secrets',
    'audit:prisma',
    'format:check',
    'build:shared',
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
  ];
  const localTestStages = getAllStagesForMode('test', false);
  for (const stage of expectedLocalTestStages) {
    assert.ok(
      localTestStages.includes(stage),
      `Local npm test missing CI-parity stage: ${stage}`,
    );
  }

  const ciTestStages = getAllStagesForMode('test', true);
  for (const stage of [
    'test:quality-gates',
    'test:unit:shared',
    'test:unit:api',
    'test:unit:web',
  ]) {
    assert.ok(ciTestStages.includes(stage), `CI npm test missing stage: ${stage}`);
  }
  assert.equal(
    ciTestStages.some((stage) => stage.startsWith('lint:') || stage.startsWith('typecheck:')),
    false,
    'CI npm test must not duplicate lint:* or typecheck:* already run in ci.yml.',
  );

  const pushStages = getAllStagesForMode('push', false);
  for (const requiredStage of [
    ...expectedLocalTestStages,
    'audit:deps',
    'test:e2e:api',
    'build:api',
    'build:web',
    'audit:ui',
    'test:e2e:web',
    'audit:docker',
  ]) {
    assert.ok(
      pushStages.includes(requiredStage),
      `verify:push missing CI-parity stage: ${requiredStage}`,
    );
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts?.['verify:commit'], 'node scripts/verify-commit-fast.mjs');
  assert.equal(pkg.scripts?.['verify:push'], 'node scripts/run-verify-suite.mjs --mode=push');
  assert.equal(pkg.scripts?.test, 'node scripts/run-verify-suite.mjs --mode=test');

  const preCommitHook = fs.readFileSync(path.join(REPO_ROOT, '.githooks', 'pre-commit'), 'utf8');
  const prePushHook = fs.readFileSync(path.join(REPO_ROOT, '.githooks', 'pre-push'), 'utf8');
  assert.match(preCommitHook, /npm run verify:commit/);
  assert.match(prePushHook, /npm run verify:push/);
  assert.equal(preCommitHook.includes('\r'), false, '.githooks/pre-commit must use LF line endings.');
  assert.equal(prePushHook.includes('\r'), false, '.githooks/pre-push must use LF line endings.');
});
