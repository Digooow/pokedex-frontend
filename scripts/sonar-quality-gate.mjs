import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { runJscpd } from 'jscpd';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const DEFAULT_SONAR_HOST = 'https://sonarcloud.io';
const DEFAULT_MIN_LINES = '10';
const DEFAULT_MIN_TOKENS = '95';
const DEFAULT_TIMEOUT_SEC = 420;
const DEFAULT_POLL_SEC = 15;
const DOCS_ONLY_GRACE_SEC = 45;
const REQUEST_TIMEOUT_MS = 15_000;
const IGNORED_IMPORT_PATTERN =
  String.raw`^import\s+[\s\S]*?from\s+['"][^'"]+['"];?$`;

function parsePositiveInt(rawValue, fallback) {
  if (!rawValue) {
    return fallback;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseCliOptions(argv) {
  const options = {
    mode: 'remote',
    project: '',
    host: '',
    sha: '',
    pr: '',
    wait: false,
    timeoutSec: DEFAULT_TIMEOUT_SEC,
    pollSec: DEFAULT_POLL_SEC,
  };

  for (const arg of argv) {
    if (arg === '--wait') {
      options.wait = true;
      continue;
    }
    if (arg.startsWith('--mode=')) {
      options.mode = arg.slice('--mode='.length);
    } else if (arg.startsWith('--project=')) {
      options.project = arg.slice('--project='.length).trim();
    } else if (arg.startsWith('--host=')) {
      options.host = arg.slice('--host='.length).trim();
    } else if (arg.startsWith('--sha=')) {
      options.sha = arg.slice('--sha='.length).trim();
    } else if (arg.startsWith('--pr=')) {
      options.pr = arg.slice('--pr='.length).trim();
    } else if (arg.startsWith('--timeout-sec=')) {
      options.timeoutSec = parsePositiveInt(
        arg.slice('--timeout-sec='.length),
        DEFAULT_TIMEOUT_SEC,
      );
    } else if (arg.startsWith('--poll-sec=')) {
      options.pollSec = parsePositiveInt(
        arg.slice('--poll-sec='.length),
        DEFAULT_POLL_SEC,
      );
    }
  }

  return options;
}

function splitCsv(value) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function readSonarProperties(repoRoot) {
  const propertiesPath = path.join(repoRoot, '.sonarcloud.properties');
  const defaults = {
    sources: ['apps', 'packages'],
    exclusions: [
      'apps/api/prisma/migrations/**',
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.angular/**',
      '**/*.spec.ts',
      '**/*.e2e-spec.ts',
    ],
    projectKey: '',
  };

  if (!fs.existsSync(propertiesPath)) {
    return defaults;
  }

  const lines = fs.readFileSync(propertiesPath, 'utf8').split(/\r?\n/);
  const map = new Map();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const val = line.slice(separator + 1).trim();
    map.set(key, val);
  }

  const sourcesRaw = map.get('sonar.sources');
  const exclusions = [
    ...splitCsv(map.get('sonar.exclusions') ?? ''),
    ...splitCsv(map.get('sonar.cpd.exclusions') ?? ''),
  ];

  return {
    sources: sourcesRaw ? splitCsv(sourcesRaw) : defaults.sources,
    exclusions:
      exclusions.length > 0
        ? Array.from(new Set(exclusions))
        : defaults.exclusions,
    projectKey: map.get('sonar.projectKey') ?? '',
  };
}

function runGitSafe(args) {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function inferProjectKeyFromGit() {
  const remoteUrl = runGitSafe(['remote', 'get-url', 'origin']);
  if (!remoteUrl) {
    return '';
  }
  const match = remoteUrl.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) {
    return '';
  }
  return `${match[1]}_${match[2]}`;
}

function resolveHostUrl(cliHost) {
  const raw = cliHost || process.env.SONAR_HOST_URL || DEFAULT_SONAR_HOST;
  const parsed = new URL(raw);
  const isLoopback =
    parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (parsed.protocol !== 'https:' && !isLoopback) {
    throw new Error(`Unsafe SONAR_HOST_URL protocol: ${parsed.protocol}`);
  }
  return raw.replace(/\/+$/, '');
}

function resolveProjectKey(cliProject, propsKey) {
  const resolved =
    cliProject ||
    process.env.SONAR_PROJECT_KEY ||
    propsKey ||
    inferProjectKeyFromGit();

  if (!resolved) {
    throw new Error(
      'Unable to resolve Sonar project key. Pass --project=<key> or set SONAR_PROJECT_KEY.',
    );
  }
  return resolved;
}

function runLocalDuplicationGate(props) {
  const ignoredGlobs = Array.from(
    new Set([
      ...props.exclusions,
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.angular/**',
      '**/*.scss',
      '**/*.css',
    ]),
  );

  const args = [
    '--format',
    'typescript,javascript,markup',
    '--min-lines',
    DEFAULT_MIN_LINES,
    '--min-tokens',
    DEFAULT_MIN_TOKENS,
    '--ignore',
    ignoredGlobs.join(','),
    '--ignore-pattern',
    IGNORED_IMPORT_PATTERN,
    '--threshold',
    '0',
    '--exit-code',
    '1',
    '--no-tips',
    '--reporters',
    'console',
    ...props.sources,
  ];

  console.log(
    `[sonar-gate:local] Running zero-duplication CPD check across: ${props.sources.join(', ')}`,
  );
  const result = runJscpd(args, { cwd: REPO_ROOT, stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    console.error(
      '[sonar-gate:local] FAILED: Code duplication detected. Refactor duplicated logic before committing or pushing.',
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    '[sonar-gate:local] PASSED: 0 duplicated blocks/lines detected.',
  );
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.angular']);
const NATIVE_ROLE_REPLACEMENTS = new Set([
  'region',
  'group',
  'img',
  'button',
  'link',
  'navigation',
  'main',
  'banner',
  'contentinfo',
  'list',
  'listitem',
  'heading',
  'article',
  'complementary',
  'form',
  'search',
]);

function walkSourceFiles(dirPath, out = []) {
  if (!fs.existsSync(dirPath)) return out;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    const rel = path.relative(REPO_ROOT, fullPath).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      if (!rel.startsWith('apps/api/prisma/migrations')) {
        walkSourceFiles(fullPath, out);
      }
      continue;
    }
    if (/\.(ts|js|html|scss)$/.test(entry.name)) {
      out.push({ fullPath, rel });
    }
  }
  return out;
}

function lineNumberAt(content, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function collectImportedIdentifiers(content) {
  const imported = new Set();
  const importRegex = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"][^'"]+['"]/g;
  for (const match of content.matchAll(importRegex)) {
    const clause = (match[1] ?? '').trim();
    const braceMatch = /\{([\s\S]*?)\}/.exec(clause);
    if (braceMatch?.[1]) {
      for (const spec of braceMatch[1].split(',')) {
        const cleaned = spec.replace(/^\s*type\s+/, '').trim();
        if (!cleaned) continue;
        const aliasParts = cleaned.split(/\s+as\s+/);
        imported.add((aliasParts[1] ?? aliasParts[0] ?? '').trim());
      }
    }
    const defaultPart = clause.split('{')[0]?.replace(',', '').trim();
    if (defaultPart && !defaultPart.startsWith('*')) imported.add(defaultPart);
  }
  return imported;
}

function checkTypeScriptParity(rel, content, findings) {
  if (
    rel.endsWith('.spec.ts') ||
    rel.endsWith('.e2e-spec.ts') ||
    rel.endsWith('.spec-helper.ts')
  ) {
    return;
  }
  const copyLoopRegex =
    /for\s*\(\s*(?:const|let|var)\s+[^)]+\s+of\s+(?:\[\s*\.\.\.|Array\.from\s*\()/g;
  for (const m of content.matchAll(copyLoopRegex)) {
    findings.push(
      `[typescript:S7747] ${rel}:${lineNumberAt(content, m.index ?? 0)} -> Avoid copying iterable inside for...of; iterate directly or use reverse index loop.`,
    );
  }

  const imported = collectImportedIdentifiers(content);
  const bareExportRegex = /(?:^|\n)export\s*\{([^}]+)\}\s*;/g;
  for (const m of content.matchAll(bareExportRegex)) {
    const specs = (m[1] ?? '').split(',');
    for (const spec of specs) {
      const cleaned = spec.replace(/^\s*type\s+/, '').trim();
      const localName = cleaned.split(/\s+as\s+/)[0]?.trim();
      if (localName && imported.has(localName)) {
        findings.push(
          `[typescript:S7763] ${rel}:${lineNumberAt(content, m.index ?? 0)} -> Use "export ... from '...'" to re-export "${localName}".`,
        );
      }
    }
  }

  const optionalChainRegex =
    /\bif\s*\(\s*([a-zA-Z_$][\w$]*)\s*&&\s*\1(?:\.[a-zA-Z_$][\w$]*)+(?:\([^)]*\))?\s*(?:===|==|>=|<=|>|<|\))/g;
  for (const m of content.matchAll(optionalChainRegex)) {
    findings.push(
      `[typescript:S6582] ${rel}:${lineNumberAt(content, m.index ?? 0)} -> Prefer optional chaining ("${m[1]}?....") instead of "${m[1]} && ${m[1]}...".`,
    );
  }
}

function checkHtmlParity(rel, content, findings) {
  const roleRegex = /(?<!\[attr\.)\brole\s*=\s*["']([a-z-]+)["']/g;
  for (const m of content.matchAll(roleRegex)) {
    const roleName = m[1] ?? '';
    if (NATIVE_ROLE_REPLACEMENTS.has(roleName)) {
      findings.push(
        `[Web:S6819] ${rel}:${lineNumberAt(content, m.index ?? 0)} -> Use native HTML element instead of role="${roleName}".`,
      );
    }
  }

  const nonInteractiveClickRegex =
    /<(div|span|section|article|p|li|img|header|footer)\b([^>]*)>/gs;
  for (const m of content.matchAll(nonInteractiveClickRegex)) {
    const attrs = m[2] ?? '';
    if (
      /\(click\)\s*=/.test(attrs) &&
      !/\(click\)\s*=\s*["']\$event\.stopPropagation\(\)["']/.test(attrs) &&
      !/\(key(down|up)\b/.test(attrs)
    ) {
      findings.push(
        `[Web:S1082] ${rel}:${lineNumberAt(content, m.index ?? 0)} -> Non-native clickable <${m[1]}> needs keyboard handler or <button>.`,
      );
    }
  }

  const tagWithAriaHiddenRegex = /<([a-zA-Z][\w-]*)\b([^>]*)>/gs;
  for (const m of content.matchAll(tagWithAriaHiddenRegex)) {
    const tag = (m[1] ?? '').toLowerCase();
    const attrs = m[2] ?? '';
    if (!/\baria-hidden\s*=\s*["']true["']/.test(attrs)) continue;
    const isFocusable =
      tag === 'button' ||
      tag === 'a' ||
      tag === 'input' ||
      tag === 'select' ||
      tag === 'textarea' ||
      /\btabindex\s*=\s*["']0["']/.test(attrs);
    if (isFocusable) {
      findings.push(
        `[Web:S6825] ${rel}:${lineNumberAt(content, m.index ?? 0)} -> aria-hidden="true" must not be set on focusable <${tag}>.`,
      );
    }
  }

  const selectWithAriaLabelRegex = /<select\b([^>]*)>/gs;
  for (const m of content.matchAll(selectWithAriaLabelRegex)) {
    const attrs = m[1] ?? '';
    if (/\baria-label\s*=/.test(attrs)) {
      findings.push(
        `[Web:S7927] ${rel}:${lineNumberAt(content, m.index ?? 0)} -> Avoid aria-label directly on <select>; associate a <label for="..."> (or .sr-only-static) instead.`,
      );
    }
  }
}

function checkScssParity(rel, content, findings) {
  if (!rel.startsWith('apps/web/src/app/')) return;
  if (/prefers-reduced-motion/.test(content)) return;
  const motionMatch = /(?:^|[\s;{])(?:transition|animation)\s*:\s*(?!none\b)/m.exec(
    content,
  );
  if (motionMatch) {
    findings.push(
      `[css:S9440] ${rel}:${lineNumberAt(content, motionMatch.index)} -> Respect @media (prefers-reduced-motion: reduce) when declaring transitions/animations.`,
    );
  }
}

function runLocalSonarParityGate(props) {
  const files = props.sources.flatMap((src) =>
    walkSourceFiles(path.join(REPO_ROOT, src)),
  );
  const findings = [];
  for (const file of files) {
    const content = fs.readFileSync(file.fullPath, 'utf8');
    if (file.rel.endsWith('.ts') || file.rel.endsWith('.js')) {
      checkTypeScriptParity(file.rel, content, findings);
    } else if (file.rel.endsWith('.html')) {
      checkHtmlParity(file.rel, content, findings);
    } else if (file.rel.endsWith('.scss')) {
      checkScssParity(file.rel, content, findings);
    }
  }
  if (findings.length > 0) {
    console.error(
      `[sonar-gate:local] FAILED: ${findings.length} SonarCloud parity issue(s) found:`,
    );
    for (const item of findings) console.error(`  - ${item}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `[sonar-gate:local] PASSED: 0 SonarCloud parity issues across ${files.length} source files.`,
  );
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `HTTP ${response.status} from ${url}: ${body.slice(0, 300)}`,
    );
  }
  return response.json();
}

function buildSonarHeaders() {
  const token = process.env.SONAR_TOKEN?.trim();
  if (!token) {
    return { Accept: 'application/json' };
  }
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

function buildGithubHeaders() {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    return null;
  }
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function isSonarSourceFile(filePath, sources) {
  if (filePath === '.sonarcloud.properties') {
    return true;
  }
  return sources.some(
    (source) => filePath === source || filePath.startsWith(`${source}/`),
  );
}

async function detectSourcesChanged(options, sources) {
  const ghHeaders = buildGithubHeaders();
  const repo = process.env.GITHUB_REPOSITORY?.trim();

  if (ghHeaders && repo && options.pr) {
    const url = `https://api.github.com/repos/${repo}/pulls/${encodeURIComponent(options.pr)}/files?per_page=100`;
    try {
      const files = await fetchJson(url, ghHeaders);
      return Array.isArray(files)
        ? files.some((item) => isSonarSourceFile(item.filename ?? '', sources))
        : true;
    } catch {
      return true;
    }
  }

  if (ghHeaders && repo && options.sha) {
    const url = `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(options.sha)}`;
    try {
      const commit = await fetchJson(url, ghHeaders);
      const files = Array.isArray(commit?.files) ? commit.files : [];
      return files.some((item) =>
        isSonarSourceFile(item.filename ?? '', sources),
      );
    } catch {
      return true;
    }
  }

  const changedOutput = runGitSafe([
    'diff-tree',
    '--no-commit-id',
    '--name-only',
    '-r',
    options.sha || 'HEAD',
  ]);
  if (!changedOutput) {
    return true;
  }
  return changedOutput
    .split(/\r?\n/)
    .some((filePath) => isSonarSourceFile(filePath.trim(), sources));
}

async function readSonarCheckRun(sha) {
  const ghHeaders = buildGithubHeaders();
  const repo = process.env.GITHUB_REPOSITORY?.trim();
  if (!ghHeaders || !repo || !sha) {
    return null;
  }
  const url = `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(sha)}/check-runs?check_name=${encodeURIComponent('SonarCloud Code Analysis')}`;
  try {
    const payload = await fetchJson(url, ghHeaders);
    const runs = Array.isArray(payload?.check_runs) ? payload.check_runs : [];
    return runs[0] ?? null;
  } catch {
    return null;
  }
}

async function hasMatchingSonarAnalysis(hostUrl, projectKey, options, headers) {
  if (options.pr) {
    const url = `${hostUrl}/api/project_pull_requests/list?project=${encodeURIComponent(projectKey)}`;
    const payload = await fetchJson(url, headers);
    const prs = Array.isArray(payload?.pullRequests)
      ? payload.pullRequests
      : [];
    const match = prs.find((entry) => entry.key === String(options.pr));
    if (!match) {
      return false;
    }
    return !options.sha || match.commit?.sha === options.sha;
  }

  if (!options.sha) {
    return true;
  }

  const url = `${hostUrl}/api/project_analyses/search?project=${encodeURIComponent(projectKey)}&ps=10`;
  const payload = await fetchJson(url, headers);
  const analyses = Array.isArray(payload?.analyses) ? payload.analyses : [];
  return analyses.some((entry) => entry.revision === options.sha);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRemoteAnalysis(hostUrl, projectKey, options, sources, headers) {
  const sourcesChanged = await detectSourcesChanged(options, sources);
  const deadlineMs = Date.now() + options.timeoutSec * 1000;
  const docsDeadlineMs = Date.now() + DOCS_ONLY_GRACE_SEC * 1000;

  console.log(
    `[sonar-gate:remote] Waiting for SonarCloud analysis (sha=${options.sha || 'latest'}, pr=${options.pr || 'none'}, sourcesChanged=${sourcesChanged})...`,
  );

  while (Date.now() < deadlineMs) {
    const checkRun = await readSonarCheckRun(options.sha);
    if (checkRun?.status === 'completed') {
      if (
        checkRun.conclusion === 'failure' ||
        checkRun.conclusion === 'cancelled' ||
        checkRun.conclusion === 'timed_out'
      ) {
        throw new Error(
          `GitHub Check Run "SonarCloud Code Analysis" finished with conclusion=${checkRun.conclusion}.`,
        );
      }
      if (checkRun.conclusion === 'skipped' || checkRun.conclusion === 'neutral') {
        console.log(
          `[sonar-gate:remote] Check Run marked ${checkRun.conclusion}; proceeding to verify repository baseline.`,
        );
        return;
      }
    }

    const matched = await hasMatchingSonarAnalysis(
      hostUrl,
      projectKey,
      options,
      headers,
    );
    if (matched) {
      console.log('[sonar-gate:remote] Matching SonarCloud analysis found.');
      return;
    }

    if (!sourcesChanged && Date.now() >= docsDeadlineMs) {
      console.log(
        '[sonar-gate:remote] No files changed under sonar.sources; verifying current SonarCloud project baseline.',
      );
      return;
    }

    await sleep(options.pollSec * 1000);
  }

  throw new Error(
    `Timed out after ${options.timeoutSec}s waiting for SonarCloud analysis for sha=${options.sha || 'unknown'}.`,
  );
}

function buildScopeQuery(options) {
  return options.pr ? `&pullRequest=${encodeURIComponent(options.pr)}` : '';
}

function extractMetricNumber(measure) {
  if (!measure) {
    return 0;
  }
  const raw = measure.value ?? measure.period?.value ?? '0';
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function evaluateStrictMetrics(measuresMap, isPullRequest) {
  const zeroMetrics = isPullRequest
    ? [
        'bugs',
        'vulnerabilities',
        'code_smells',
        'violations',
        'duplicated_lines',
        'duplicated_blocks',
        'new_violations',
        'new_duplicated_lines',
        'new_duplicated_blocks',
      ]
    : [
        'bugs',
        'vulnerabilities',
        'code_smells',
        'violations',
        'duplicated_lines',
        'duplicated_blocks',
      ];

  const failures = [];
  for (const key of zeroMetrics) {
    const value = extractMetricNumber(measuresMap.get(key));
    if (value > 0) {
      failures.push(`${key}=${value} (expected 0)`);
    }
  }
  return failures;
}

function printUnpushedWarning() {
  const aheadCountRaw = runGitSafe(['rev-list', '@{u}..HEAD', '--count']);
  const aheadCount = Number.parseInt(aheadCountRaw || '0', 10);
  if (aheadCount > 0) {
    console.warn(
      `[sonar-gate:remote] Note: local branch is ${aheadCount} commit(s) ahead of upstream. Remote metrics reflect the last pushed commit analyzed by SonarCloud.`,
    );
  }
}

async function printDuplicatedFiles(hostUrl, projectKey, scopeQuery, headers) {
  const treeUrl = `${hostUrl}/api/measures/component_tree?component=${encodeURIComponent(projectKey)}&metricKeys=duplicated_lines,duplicated_blocks&qualifiers=FIL&s=metric&metricSort=duplicated_lines&asc=false&ps=25${scopeQuery}`;
  const treePayload = await fetchJson(treeUrl, headers);
  const files = Array.isArray(treePayload?.components)
    ? treePayload.components
    : [];
  const offending = files.filter((file) => {
    const lines = file.measures?.find(
      (item) => item.metric === 'duplicated_lines',
    );
    return Number(lines?.value ?? 0) > 0;
  });

  if (offending.length === 0) {
    return;
  }

  console.error('[sonar-gate:remote] Files with code duplication:');
  for (const file of offending) {
    const lines =
      file.measures?.find((item) => item.metric === 'duplicated_lines')?.value ??
      '0';
    const blocks =
      file.measures?.find((item) => item.metric === 'duplicated_blocks')
        ?.value ?? '0';
    console.error(`  - ${file.path}: ${lines} lines (${blocks} blocks)`);
  }
}

async function fetchRemoteSnapshot(hostUrl, projectKey, scopeQuery, headers) {
  const metricKeys = [
    'alert_status',
    'bugs',
    'vulnerabilities',
    'code_smells',
    'security_hotspots',
    'duplicated_lines_density',
    'duplicated_lines',
    'duplicated_blocks',
    'violations',
    'new_violations',
    'new_duplicated_lines',
    'new_duplicated_blocks',
  ].join(',');

  const encodedKey = encodeURIComponent(projectKey);
  const [qualityGate, issues, hotspots, measures] = await Promise.all([
    fetchJson(
      `${hostUrl}/api/qualitygates/project_status?projectKey=${encodedKey}${scopeQuery}`,
      headers,
    ),
    fetchJson(
      `${hostUrl}/api/issues/search?componentKeys=${encodedKey}&resolved=false&ps=100${scopeQuery}`,
      headers,
    ),
    fetchJson(
      `${hostUrl}/api/hotspots/search?projectKey=${encodedKey}&status=TO_REVIEW&ps=100${scopeQuery}`,
      headers,
    ),
    fetchJson(
      `${hostUrl}/api/measures/component?component=${encodedKey}&metricKeys=${metricKeys}${scopeQuery}`,
      headers,
    ),
  ]);

  return { qualityGate, issues, hotspots, measures };
}

function printOpenFindings(openIssues, openHotspots) {
  if (openIssues.length > 0) {
    console.error('[sonar-gate:remote] Unresolved issues:');
    for (const issue of openIssues) {
      const filePath = String(issue.component ?? '').split(':').pop();
      const line = issue.line ?? '?';
      console.error(
        `  - [${issue.severity}/${issue.type}] ${issue.rule} at ${filePath}:${line} -> ${issue.message}`,
      );
    }
  }

  if (openHotspots.length > 0) {
    console.error('[sonar-gate:remote] Security hotspots to review:');
    for (const hotspot of openHotspots) {
      const filePath = String(hotspot.component ?? '').split(':').pop();
      const line = hotspot.line ?? '?';
      console.error(
        `  - [${hotspot.vulnerabilityProbability ?? 'HIGH'}] ${hotspot.ruleKey ?? 'hotspot'} at ${filePath}:${line} -> ${hotspot.message}`,
      );
    }
  }
}

async function runRemoteSonarGate(options, props) {
  const hostUrl = resolveHostUrl(options.host);
  const projectKey = resolveProjectKey(options.project, props.projectKey);
  const headers = buildSonarHeaders();

  if (!options.wait) {
    printUnpushedWarning();
  } else {
    await waitForRemoteAnalysis(
      hostUrl,
      projectKey,
      options,
      props.sources,
      headers,
    );
  }

  const scopeQuery = buildScopeQuery(options);
  const { qualityGate, issues, hotspots, measures } =
    await fetchRemoteSnapshot(hostUrl, projectKey, scopeQuery, headers);

  const gateStatus = qualityGate?.projectStatus?.status ?? 'UNKNOWN';
  const openIssues = Array.isArray(issues?.issues) ? issues.issues : [];
  const totalIssues = Number(issues?.total ?? openIssues.length);
  const openHotspots = Array.isArray(hotspots?.hotspots)
    ? hotspots.hotspots
    : [];
  const totalHotspots = Number(
    hotspots?.paging?.total ?? openHotspots.length,
  );
  const measureList = Array.isArray(measures?.component?.measures)
    ? measures.component.measures
    : [];
  const measuresMap = new Map(measureList.map((item) => [item.metric, item]));

  const failures = [];
  if (gateStatus !== 'OK') {
    failures.push(`qualityGate=${gateStatus} (expected OK)`);
  }
  if (totalIssues > 0) {
    failures.push(`openIssues=${totalIssues} (expected 0)`);
  }
  if (totalHotspots > 0) {
    failures.push(`securityHotspotsToReview=${totalHotspots} (expected 0)`);
  }
  failures.push(...evaluateStrictMetrics(measuresMap, Boolean(options.pr)));

  if (failures.length === 0) {
    console.log(
      `[sonar-gate:remote] PASSED (${projectKey}): Quality Gate OK, 0 issues, 0 hotspots, 0 duplicated lines/blocks.`,
    );
    return;
  }

  console.error(
    `[sonar-gate:remote] FAILED (${projectKey}): ${failures.join(' | ')}`,
  );
  printOpenFindings(openIssues, openHotspots);

  const duplicatedLines = extractMetricNumber(
    measuresMap.get('duplicated_lines'),
  );
  const newDuplicatedLines = extractMetricNumber(
    measuresMap.get('new_duplicated_lines'),
  );
  if (duplicatedLines > 0 || newDuplicatedLines > 0) {
    await printDuplicatedFiles(hostUrl, projectKey, scopeQuery, headers);
  }

  process.exitCode = 1;
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const props = readSonarProperties(REPO_ROOT);

  if (options.mode === 'local') {
    runLocalDuplicationGate(props);
    if (process.exitCode !== 1) {
      runLocalSonarParityGate(props);
    }
    return;
  }

  if (options.mode === 'remote') {
    await runRemoteSonarGate(options, props);
    return;
  }

  throw new Error(
    `Unsupported --mode="${options.mode}". Use --mode=local or --mode=remote.`,
  );
}

main().catch((error) => {
  console.error('[sonar-gate] Fatal error:', error?.message ?? error);
  process.exitCode = 1;
});
