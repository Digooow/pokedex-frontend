import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.angular']);
const SPEC_FILE_SUFFIXES = ['.spec.ts', '.e2e-spec.ts', '.spec-helper.ts'];

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

export function lineNumberAt(content, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.codePointAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

export function formatParityFinding(finding) {
  return `[${finding.rule}] ${finding.file}:${finding.line} -> ${finding.message}`;
}

export function walkSourceFiles(repoRoot, dirPath, out = []) {
  if (!fs.existsSync(dirPath)) {
    return out;
  }
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    const rel = path.relative(repoRoot, fullPath).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      if (
        !rel.startsWith('apps/api/prisma/migrations') &&
        !rel.startsWith('apps/web/public/assets/draco')
      ) {
        walkSourceFiles(repoRoot, fullPath, out);
      }
      continue;
    }
    if (/\.(ts|js|html|scss)$/.test(entry.name)) {
      out.push({ fullPath, rel });
    }
  }
  return out;
}

function isSpecFile(rel) {
  return SPEC_FILE_SUFFIXES.some((suffix) => rel.endsWith(suffix));
}

function collectImportedIdentifiers(content) {
  const imported = new Set();
  const importRegex =
    /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"][^'"]+['"]/g;
  for (const match of content.matchAll(importRegex)) {
    const clause = (match[1] ?? '').trim();
    const braceMatch = /\{([\s\S]*?)\}/.exec(clause);
    if (braceMatch?.[1]) {
      for (const spec of braceMatch[1].split(',')) {
        const cleaned = spec.replace(/^\s*type\s+/, '').trim();
        if (!cleaned) {
          continue;
        }
        const aliasParts = cleaned.split(/\s+as\s+/);
        imported.add((aliasParts[1] ?? aliasParts[0] ?? '').trim());
      }
    }
    const defaultPart = clause.split('{')[0]?.replace(',', '').trim();
    if (defaultPart && !defaultPart.startsWith('*')) {
      imported.add(defaultPart);
    }
  }
  return imported;
}

function checkReexports(rel, content, findings) {
  const imported = collectImportedIdentifiers(content);
  const bareExportRegex = /(?:^|\n)export\s*\{([^}]+)\}\s*;/g;
  for (const m of content.matchAll(bareExportRegex)) {
    const specs = (m[1] ?? '').split(',');
    for (const spec of specs) {
      const cleaned = spec.replace(/^\s*type\s+/, '').trim();
      const localName = cleaned.split(/\s+as\s+/)[0]?.trim();
      if (localName && imported.has(localName)) {
        findings.push({
          rule: 'typescript:S7763',
          file: rel,
          line: lineNumberAt(content, m.index ?? 0),
          message: `Use "export ... from '...'" to re-export "${localName}".`,
        });
      }
    }
  }
}

function checkStringRawCandidates(rel, content, findings) {
  const stringRegex = /(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  const regexEscapeOrWinPath =
    /\\(?:[dDsSwWbBpP.+*?^$()[\]{}|]|[^\\/\s]+\\[^\\/\s]+)/;

  for (const m of content.matchAll(stringRegex)) {
    const body = m[2] ?? '';
    if (!body.includes('\\\\')) {
      continue;
    }
    const index = m.index ?? 0;
    const lineStart = content.lastIndexOf('\n', index) + 1;
    const prefix = content.slice(lineStart, index);
    if (prefix.includes('String.raw')) {
      continue;
    }
    const unescaped = body.replaceAll('\\\\', '\\');
    if (regexEscapeOrWinPath.test(unescaped)) {
      findings.push({
        rule: 'typescript:S7780',
        file: rel,
        line: lineNumberAt(content, index),
        message: 'Prefer String.raw to avoid escaping backslashes.',
      });
    }
  }
}

function checkRegexReplaceAll(rel, content, findings) {
  const replaceGlobalRegex = /\.replace\(\s*\/((?:[^/\n\\]|\\[\s\S])+?)\/g\s*,/g;
  const metaCharRegex = /(?:^|[^\\])[.*+?^$[\]()|]|\\[dDsSwWbBpPk0-9]/;
  for (const m of content.matchAll(replaceGlobalRegex)) {
    const pattern = m[1] ?? '';
    if (!metaCharRegex.test(pattern)) {
      findings.push({
        rule: 'typescript:S7781',
        file: rel,
        line: lineNumberAt(content, m.index ?? 0),
        message: 'Use String#replaceAll() instead of a global literal regex.',
      });
    }
  }
}

function checkSomePreferIncludes(rel, content, findings) {
  const someEqualityRegex =
    /\.some\(\s*(?:\(\s*([a-zA-Z_$][\w$]*)(?:\s*:[^,)]+)?\s*\)|([a-zA-Z_$][\w$]*))\s*=>\s*(?:\{\s*return\s+)?([^;{}()=]+?)\s*(?<![!=])===?\s*([^;{}()=]+?)(?:\s*;?\s*\})?\s*\)/g;
  for (const m of content.matchAll(someEqualityRegex)) {
    const param = m[1] ?? m[2] ?? '';
    const left = (m[3] ?? '').trim();
    const right = (m[4] ?? '').trim();
    if (!param || (left !== param && right !== param)) {
      continue;
    }
    const other = left === param ? right : left;
    const otherIdentifiers = other.split(/[^a-zA-Z0-9_$]+/);
    if (!other || /[&|?:,]/.test(other) || otherIdentifiers.includes(param)) {
      continue;
    }
    findings.push({
      rule: 'typescript:S7765',
      file: rel,
      line: lineNumberAt(content, m.index ?? 0),
      message: `Use .includes(${other}) instead of .some() when checking value existence.`,
    });
  }
}

export function checkTypeScriptParity(rel, content) {
  const findings = [];
  checkReexports(rel, content, findings);
  if (isSpecFile(rel)) {
    return findings;
  }

  const copyLoopRegex =
    /for\s*\(\s*(?:const|let|var)\s+[^)]+\s+of\s+(?:\[\s*\.\.\.|Array\.from\s*\()/g;
  for (const m of content.matchAll(copyLoopRegex)) {
    findings.push({
      rule: 'typescript:S7747',
      file: rel,
      line: lineNumberAt(content, m.index ?? 0),
      message:
        'Avoid copying iterable inside for...of; iterate directly or use reverse index loop.',
    });
  }

  const optionalChainRegex =
    /\bif\s*\(\s*([a-zA-Z_$][\w$]*)\s*&&\s*\1(?:\.[a-zA-Z_$][\w$]*)+(?:\([^)]*\))?\s*(?:===|==|>=|<=|>|<|\))/g;
  for (const m of content.matchAll(optionalChainRegex)) {
    findings.push({
      rule: 'typescript:S6582',
      file: rel,
      line: lineNumberAt(content, m.index ?? 0),
      message: `Prefer optional chaining ("${m[1]}?....") instead of "${m[1]} && ${m[1]}...".`,
    });
  }

  for (const m of content.matchAll(/\.charCodeAt\s*\(/g)) {
    findings.push({
      rule: 'typescript:S7758',
      file: rel,
      line: lineNumberAt(content, m.index ?? 0),
      message: 'Prefer String#codePointAt() over String#charCodeAt().',
    });
  }

  const ternaryFloorZeroRegex =
    /(?:\breturn\s+|[=:(,]\s*)([a-zA-Z_$][\w$]*)\s*>=?\s*0\s*\?\s*\1\s*:\s*0\b/g;
  for (const m of content.matchAll(ternaryFloorZeroRegex)) {
    findings.push({
      rule: 'typescript:S7766',
      file: rel,
      line: lineNumberAt(content, m.index ?? 0),
      message: `Prefer Math.max(${m[1]}, 0) instead of ternary expression.`,
    });
  }

  const directCallbackRegex =
    /\.(?:map|filter|flatMap|forEach|some|every|find)\(\s*([a-z_$][\w$]*)\s*\)/g;
  for (const m of content.matchAll(directCallbackRegex)) {
    findings.push({
      rule: 'typescript:S7727',
      file: rel,
      line: lineNumberAt(content, m.index ?? 0),
      message: `Wrap function "${m[1]}" in an arrow callback instead of passing it directly.`,
    });
  }

  const aliasedInputRegex =
    /@Input\(\s*['"][^'"]+['"]\s*\)|\binput(?:<[^>]+>)?\s*\([^)]*\{[^}]*\balias\s*:/g;
  for (const m of content.matchAll(aliasedInputRegex)) {
    findings.push({
      rule: 'typescript:S7649',
      file: rel,
      line: lineNumberAt(content, m.index ?? 0),
      message: 'Input bindings should not be aliased.',
    });
  }

  checkRegexReplaceAll(rel, content, findings);
  checkStringRawCandidates(rel, content, findings);
  checkSomePreferIncludes(rel, content, findings);
  return findings;
}

export function checkSuppressionBypass(rel, content) {
  const findings = [];
  const suppressionRegex =
    /\/\/\s*NOSONAR\b|@SuppressWarnings\b|\/\*\s*cpd-ignore\b/gi;
  for (const m of content.matchAll(suppressionRegex)) {
    findings.push({
      rule: 'policy:no-suppression',
      file: rel,
      line: lineNumberAt(content, m.index ?? 0),
      message:
        'Suppression markers (NOSONAR, SuppressWarnings, cpd-ignore) are forbidden.',
    });
  }
  return findings;
}

export function checkHtmlParity(rel, content) {
  const findings = [];
  const roleRegex = /(?<!\[attr\.)\brole\s*=\s*["']([a-z-]+)["']/g;
  for (const m of content.matchAll(roleRegex)) {
    const roleName = m[1] ?? '';
    if (NATIVE_ROLE_REPLACEMENTS.has(roleName)) {
      findings.push({
        rule: 'Web:S6819',
        file: rel,
        line: lineNumberAt(content, m.index ?? 0),
        message: `Use native HTML element instead of role="${roleName}".`,
      });
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
      findings.push({
        rule: 'Web:S1082',
        file: rel,
        line: lineNumberAt(content, m.index ?? 0),
        message: `Non-native clickable <${m[1]}> needs keyboard handler or <button>.`,
      });
    }
  }

  const tagRegex = /<([a-zA-Z][\w-]*)\b([^>]*)>/gs;
  for (const m of content.matchAll(tagRegex)) {
    const tag = (m[1] ?? '').toLowerCase();
    const attrs = m[2] ?? '';
    const line = lineNumberAt(content, m.index ?? 0);
    const isFocusable =
      tag === 'button' ||
      tag === 'a' ||
      tag === 'input' ||
      tag === 'select' ||
      tag === 'textarea' ||
      /\btabindex\s*=\s*["']0["']/.test(attrs);

    if (/\baria-hidden\s*=\s*["']true["']/.test(attrs) && isFocusable) {
      findings.push({
        rule: 'Web:S6825',
        file: rel,
        line,
        message: `aria-hidden="true" must not be set on focusable <${tag}>.`,
      });
    }

    const nonInteractiveRole =
      /\brole\s*=\s*["'](presentation|none|img|region|article|document|note)["']/.exec(
        attrs,
      );
    const isNativeInteractive =
      tag === 'button' ||
      tag === 'a' ||
      tag === 'input' ||
      tag === 'select' ||
      tag === 'textarea' ||
      (tag === 'canvas' && /\btabindex\s*=\s*["']0["']/.test(attrs));
    if (isNativeInteractive && nonInteractiveRole) {
      findings.push({
        rule: 'Web:S6843',
        file: rel,
        line,
        message: `Interactive <${tag}> must not have non-interactive role="${nonInteractiveRole[1]}".`,
      });
    }
  }

  const labelRegex = /<label\b([^>]*)>([\s\S]*?)<\/label>/gs;
  for (const m of content.matchAll(labelRegex)) {
    const attrs = m[1] ?? '';
    const body = m[2] ?? '';
    const line = lineNumberAt(content, m.index ?? 0);
    const controls = body.match(/<(?:input|select|textarea|button)\b/gi) ?? [];
    if (controls.length > 1) {
      findings.push({
        rule: 'Web:S6853',
        file: rel,
        line,
        message: `<label> wraps ${controls.length} controls; associate at most 1 form control.`,
      });
    } else if (
      controls.length === 0 &&
      !/(?:^|\s)(?:for|\[for\]|\[attr\.for\])\s*=/.test(attrs)
    ) {
      findings.push({
        rule: 'Web:S6853',
        file: rel,
        line,
        message: '<label> must have a "for" attribute or wrap a form control.',
      });
    }
  }

  for (const m of content.matchAll(/<select\b([^>]*)>/gs)) {
    if (/\baria-label\s*=/.test(m[1] ?? '')) {
      findings.push({
        rule: 'Web:S7927',
        file: rel,
        line: lineNumberAt(content, m.index ?? 0),
        message:
          'Avoid aria-label directly on <select>; associate a <label for="..."> (or .sr-only-static) instead.',
      });
    }
  }

  const staticBtnLabelRegex =
    /<button\b([^>]*\baria-label\s*=\s*["']([^"']+)["'][^>]*)>([^<]+)<\/button>/gs;
  for (const m of content.matchAll(staticBtnLabelRegex)) {
    const ariaLabel = (m[2] ?? '').trim();
    const visibleText = (m[3] ?? '').replaceAll(/\s+/g, ' ').trim();
    if (
      !ariaLabel ||
      !visibleText ||
      !/[\p{L}\p{N}]/u.test(visibleText) ||
      ariaLabel.includes('{{') ||
      visibleText.includes('{{')
    ) {
      continue;
    }
    if (!ariaLabel.toLowerCase().includes(visibleText.toLowerCase())) {
      findings.push({
        rule: 'Web:S7927',
        file: rel,
        line: lineNumberAt(content, m.index ?? 0),
        message: `aria-label ("${ariaLabel}") must include visible button text ("${visibleText}").`,
      });
    }
  }

  return findings;
}

function stripCssComments(src) {
  return src
    .replaceAll(/\/\*[\s\S]*?\*\//g, (match) => match.replaceAll(/[^\n]/g, ' '))
    .replaceAll(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

function consumeBalancedInterpolation(clean, startIdx) {
  let depth = 1;
  let i = startIdx + 2;
  let chunk = '#{';
  while (i < clean.length && depth > 0) {
    const ch = clean[i];
    chunk += ch;
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
    }
    i += 1;
  }
  return { chunk, nextIndex: i - 1 };
}

function recordScssDeclaration(statement, currentScope, startIndex, rel, content, findings) {
  if (
    !statement ||
    statement.startsWith('@') ||
    statement.startsWith('$') ||
    currentScope.selector.startsWith('@keyframes')
  ) {
    return;
  }
  const colonIdx = statement.indexOf(':');
  if (colonIdx <= 0) {
    return;
  }
  const prop = statement.slice(0, colonIdx).trim().toLowerCase();
  if (!/^[a-z-][a-z0-9-]*$/.test(prop) || prop.startsWith('--')) {
    return;
  }
  if (currentScope.props.has(prop)) {
    findings.push({
      rule: 'css:S4656',
      file: rel,
      line: lineNumberAt(content, startIndex),
      message: `Duplicate property "${prop}" in "${currentScope.selector}".`,
    });
    return;
  }
  currentScope.props.set(prop, startIndex);
}

function checkScssBlocks(rel, content, findings) {
  const clean = stripCssComments(content);
  const stack = [
    { selector: '<root>', props: new Map(), childSelectors: new Map() },
  ];
  let token = '';
  let tokenStart = 0;
  let inString = null;
  let parenDepth = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (token.length === 0) {
      tokenStart = i;
    }
    if (inString) {
      if (ch === '\\') {
        token += ch + (clean[i + 1] ?? '');
        i += 1;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      token += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      token += ch;
      continue;
    }
    if (ch === '#' && clean[i + 1] === '{') {
      const { chunk, nextIndex } = consumeBalancedInterpolation(clean, i);
      token += chunk;
      i = nextIndex;
      continue;
    }
    if (ch === '(') {
      parenDepth += 1;
      token += ch;
      continue;
    }
    if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      token += ch;
      continue;
    }
    if (ch === '{' && parenDepth === 0) {
      const sel = token.trim().replaceAll(/\s+/g, ' ');
      const parent = stack.at(-1);
      if (sel && !sel.startsWith('@') && !sel.includes('#{')) {
        if (parent.childSelectors.has(sel)) {
          findings.push({
            rule: 'css:S4666',
            file: rel,
            line: lineNumberAt(content, tokenStart),
            message: `Duplicate selector "${sel}" in the same scope.`,
          });
        } else {
          parent.childSelectors.set(sel, tokenStart);
        }
      }
      stack.push({ selector: sel, props: new Map(), childSelectors: new Map() });
      token = '';
      continue;
    }
    if (ch === '}' && parenDepth === 0) {
      if (stack.length > 1) {
        stack.pop();
      }
      token = '';
      continue;
    }
    if (ch === ';' && parenDepth === 0) {
      recordScssDeclaration(
        token.trim(),
        stack.at(-1),
        tokenStart,
        rel,
        content,
        findings,
      );
      token = '';
      continue;
    }
    token += ch;
  }
}

export function checkScssParity(rel, content) {
  const findings = [];
  checkScssBlocks(rel, content, findings);

  if (rel.startsWith('apps/web/src/app/') && !/prefers-reduced-motion/.test(content)) {
    const motionMatch =
      /(?:^|[\s;{])(?:transition|animation)\s*:\s*(?!none\b)/m.exec(content);
    if (motionMatch) {
      findings.push({
        rule: 'css:S9440',
        file: rel,
        line: lineNumberAt(content, motionMatch.index),
        message:
          'Respect @media (prefers-reduced-motion: reduce) when declaring transitions/animations.',
      });
    }
  }

  return findings;
}

export function scanFileParity(rel, content) {
  const findings = checkSuppressionBypass(rel, content);
  if (rel.endsWith('.ts') || rel.endsWith('.js')) {
    findings.push(...checkTypeScriptParity(rel, content));
  } else if (rel.endsWith('.html')) {
    findings.push(...checkHtmlParity(rel, content));
  } else if (rel.endsWith('.scss')) {
    findings.push(...checkScssParity(rel, content));
  }
  return findings;
}

export function scanRepositoryParity(repoRoot, sources = ['apps', 'packages']) {
  const files = sources.flatMap((src) =>
    walkSourceFiles(repoRoot, path.join(repoRoot, src)),
  );
  const findings = [];
  for (const file of files) {
    const content = fs.readFileSync(file.fullPath, 'utf8');
    findings.push(...scanFileParity(file.rel, content));
  }
  return { filesCount: files.length, findings };
}
