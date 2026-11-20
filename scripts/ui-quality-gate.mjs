import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const DIST_BROWSER_DIR = path.join(REPO_ROOT, 'apps', 'web', 'dist', 'pokeverse-web', 'browser');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const SAMPLE_CATALOG = {
  cache: 'hit',
  catalog: {
    count: 5,
    results: [
      { name: 'bulbasaur', url: 'https://pokeapi.co/api/v2/pokemon/1/' },
      { name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon/25/' },
      { name: 'raichu', url: 'https://pokeapi.co/api/v2/pokemon/26/' },
      { name: 'gholdengo', url: 'https://pokeapi.co/api/v2/pokemon/1000/' },
      { name: 'pikachu-original-cap', url: 'https://pokeapi.co/api/v2/pokemon/10094/' },
    ],
  },
};

const SAMPLE_PIKACHU = {
  cache: 'hit',
  pokemon: {
    id: 25,
    name: 'pikachu',
    height: 4,
    weight: 60,
    types: [{ slot: 1, type: { name: 'electric', url: 'https://pokeapi.co/api/v2/type/13/' } }],
    abilities: [{ is_hidden: false, slot: 1, ability: { name: 'static', url: 'https://pokeapi.co/api/v2/ability/9/' } }],
    stats: [{ base_stat: 35, effort: 0, stat: { name: 'hp', url: 'https://pokeapi.co/api/v2/stat/1/' } }],
    sprites: {
      front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
      other: {
        'official-artwork': {
          front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',
        },
      },
    },
  },
};

function findBrowserExecutable() {
  const envBin = process.env['CHROME_BIN']?.trim();
  const candidates = [
    ...(envBin ? [envBin] : []),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('No headless Chromium/Chrome/Edge executable found. Set CHROME_BIN to run audit:ui.');
}

function allocateFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      srv.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('Failed to allocate free port.'));
        }
      });
    });
    srv.on('error', reject);
  });
}

function startDistServer(state) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(path.join(DIST_BROWSER_DIR, 'index.html'))) {
      reject(new Error(`Missing Angular dist build at ${DIST_BROWSER_DIR}. Run npm run build:web first.`));
      return;
    }

    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = reqUrl.pathname;

      if (pathname === '/health/ready') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', checks: { database: 'ok', redis: 'ok', kafka: 'ok' } }));
        return;
      }
      if (pathname === '/api/v1/system/bootstrap') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ onlineCount: 1, latestEvent: null }));
        return;
      }
      if (pathname === '/api/v1/auth/providers') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ googleEnabled: false, webauthnEnabled: true }));
        return;
      }
      if (pathname === '/api/v1/auth/session') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (state.authenticated) {
          res.end(
            JSON.stringify({
              authenticated: true,
              sessionState: 'AUTHENTICATED',
              mfaMethods: [],
              expiresInSec: 900,
              trainer: {
                id: '550e8400-e29b-41d4-a716-446655440000',
                username: 'AuditTrainer',
                email: 'audit@pokeverse.dev',
                emailVerifiedAt: new Date().toISOString(),
                mfaEnabled: false,
                hasPassword: true,
                badgesCount: 0,
                eloRating: 1000,
                lastMapId: 'pokeverse-town',
                lastX: 400,
                lastY: 320,
                createdAt: new Date().toISOString(),
              },
            }),
          );
        } else {
          res.end(JSON.stringify({ authenticated: false, canRefresh: false }));
        }
        return;
      }
      if (pathname === '/api/v1/pokedex/catalog') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(SAMPLE_CATALOG));
        return;
      }
      if (pathname.startsWith('/api/v1/pokedex/pokemon/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(SAMPLE_PIKACHU));
        return;
      }
      if (pathname === '/api/v1/pokedex/slots') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ slots: [] }));
        return;
      }

      const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      let targetPath = path.resolve(DIST_BROWSER_DIR, relPath);
      if (!targetPath.startsWith(DIST_BROWSER_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
        if (path.extname(relPath)) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        targetPath = path.join(DIST_BROWSER_DIR, 'index.html');
      }

      const ext = path.extname(targetPath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(targetPath).pipe(res);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

async function waitForPageTarget(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const list = await response.json();
        const pageTarget = list.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
        if (pageTarget) {
          return pageTarget.webSocketDebuggerUrl;
        }
      }
    } catch {
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Timed out waiting for headless browser DevTools endpoint.');
}

class CdpSession {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.consoleErrors = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });

    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message));
        } else {
          resolve(msg.result);
        }
        return;
      }

      if (msg.method === 'Runtime.exceptionThrown') {
        const desc =
          msg.params?.exceptionDetails?.exception?.description ||
          msg.params?.exceptionDetails?.text ||
          'Uncaught page exception';
        this.consoleErrors.push(desc);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
        const text = (msg.params.args || []).map((a) => a.value || a.description || '').join(' ');
        this.consoleErrors.push(text);
      }
    });

    await this.send('Page.enable');
    await this.send('Runtime.enable');
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text ||
          'Evaluation failed',
      );
    }
    return result.result?.value;
  }

  async navigateAndWait(url) {
    this.consoleErrors = [];
    await this.send('Page.navigate', { url });
    await this.evaluate(
      `new Promise((resolve) => {
        const start = Date.now();
        function check() {
          const heading = document.querySelector('#main-heading, h1');
          if (heading || Date.now() - start > 5000) {
            setTimeout(resolve, 250);
          } else {
            requestAnimationFrame(check);
          }
        }
        check();
      })`,
    );
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    await this.evaluate('new Promise((r) => setTimeout(r, 150))');
  }

  close() {
    this.ws.close();
  }
}

const AUDIT_PAGE_FN = `(() => {
  const probeCanvas = document.createElement('canvas');
  probeCanvas.width = 1;
  probeCanvas.height = 1;
  const ctx = probeCanvas.getContext('2d', { willReadFrequently: true });

  function parseCssColor(raw) {
    if (!raw || raw === 'none' || raw === 'transparent') {
      return [0, 0, 0, 0];
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillStyle = raw;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    return [data[0], data[1], data[2], data[3] / 255];
  }

  function extractGradientColor(bgImage) {
    if (!bgImage || bgImage === 'none' || !bgImage.includes('gradient')) {
      return null;
    }
    const tokens = bgImage.match(/(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\\([^()]+(?:\\([^()]*\\)[^()]*)*\\)|#[0-9a-fA-F]{3,8}/g);
    if (!tokens || tokens.length === 0) {
      return null;
    }
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumA = 0;
    let weightSum = 0;
    for (const token of tokens) {
      const [r, g, b, a] = parseCssColor(token);
      sumA += a;
      if (a > 0) {
        sumR += r * a;
        sumG += g * a;
        sumB += b * a;
        weightSum += a;
      }
    }
    const avgAlpha = sumA / tokens.length;
    if (weightSum <= 0 || avgAlpha <= 0) {
      return null;
    }
    return [sumR / weightSum, sumG / weightSum, sumB / weightSum, Math.min(1, avgAlpha)];
  }

  function compositeOver(top, bottom) {
    const aTop = top[3];
    const aBot = bottom[3];
    const outA = aTop + aBot * (1 - aTop);
    if (outA <= 0) {
      return [0, 0, 0, 0];
    }
    const r = (top[0] * aTop + bottom[0] * aBot * (1 - aTop)) / outA;
    const g = (top[1] * aTop + bottom[1] * aBot * (1 - aTop)) / outA;
    const b = (top[2] * aTop + bottom[2] * aBot * (1 - aTop)) / outA;
    return [r, g, b, outA];
  }

  function relLuminance(r, g, b) {
    const channel = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

  function contrastRatio(fg, bg) {
    const l1 = relLuminance(fg[0], fg[1], fg[2]);
    const l2 = relLuminance(bg[0], bg[1], bg[2]);
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  function isElementHidden(el) {
    let cur = el;
    while (cur && cur.nodeType === 1) {
      if (cur.hasAttribute('hidden') || cur.hasAttribute('inert')) {
        return true;
      }
      if (cur.classList.contains('visually-hidden') || cur.getAttribute('aria-hidden') === 'true') {
        return true;
      }
      if (cur.closest('.aba-frente') && document.querySelector('#pokedex-aparelho')?.getAttribute('data-aberta') === 'true') {
        return true;
      }
      if ((cur.closest('#pokedex-ala-scanner') || cur.closest('#pokedex-ala-visor')) && document.querySelector('#pokedex-aparelho')?.getAttribute('data-aberta') !== 'true') {
        return true;
      }
      const cs = getComputedStyle(cur);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) <= 0.05) {
        return true;
      }
      cur = cur.parentElement;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      return true;
    }
    if (rect.bottom < 0 || rect.top > window.innerHeight + 600) {
      return false;
    }
    return false;
  }

  function resolveSurfaceLayers(el) {
    const layers = [];
    let cur = el;
    while (cur && cur.nodeType === 1) {
      if (cur.tagName === 'BODY' || cur.tagName === 'HTML' || cur.classList.contains('app-shell') || cur.classList.contains('app-main')) {
        break;
      }
      const cs = getComputedStyle(cur);
      const elemOpacity = parseFloat(cs.opacity);
      const grad = extractGradientColor(cs.backgroundImage);
      const solid = parseCssColor(cs.backgroundColor);
      const combined = grad ? compositeOver(grad, solid) : solid;
      if (combined[3] > 0) {
        layers.push([combined[0], combined[1], combined[2], Math.min(1, combined[3] * elemOpacity)]);
      }
      cur = cur.parentElement;
    }

    let accum = [0, 0, 0, 0];
    for (const layer of layers) {
      accum = compositeOver(accum, layer);
    }
    return accum;
  }

  const failures = [];
  const vw = window.innerWidth;

  if (document.documentElement.scrollWidth > vw + 1) {
    failures.push({
      rule: 'PAGE_HORIZONTAL_OVERFLOW',
      detail: 'documentElement.scrollWidth (' + document.documentElement.scrollWidth + ') > viewport (' + vw + ')',
    });
  }
  if (document.body.scrollWidth > vw + 1) {
    failures.push({
      rule: 'BODY_HORIZONTAL_OVERFLOW',
      detail: 'body.scrollWidth (' + document.body.scrollWidth + ') > viewport (' + vw + ')',
    });
  }

  const selectorAll = Array.from(document.querySelectorAll('h1,h2,h3,h4,p,a,button,label,span,strong,code,li'));
  for (const el of selectorAll) {
    if (isElementHidden(el)) {
      continue;
    }

    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    if (rect.right > vw + 2 || rect.left < -2) {
      failures.push({
        rule: 'VIEWPORT_CLIPPING',
        tag: el.tagName.toLowerCase(),
        cls: el.className,
        text: (el.textContent || '').trim().slice(0, 48),
        detail: 'left=' + Math.round(rect.left) + ', right=' + Math.round(rect.right) + ', vw=' + vw,
      });
    }

    const canScrollX = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    const hasEllipsis = cs.overflowX === 'hidden' && cs.textOverflow === 'ellipsis';
    if (!canScrollX && !hasEllipsis && cs.display !== 'inline' && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2) {
      failures.push({
        rule: 'TEXT_BOX_OVERFLOW',
        tag: el.tagName.toLowerCase(),
        cls: el.className,
        text: (el.textContent || '').trim().slice(0, 48),
        detail: 'scrollWidth=' + el.scrollWidth + ' > clientWidth=' + el.clientWidth,
      });
    }

    const directText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => (n.textContent || '').trim())
      .join('');

    if (!directText) {
      continue;
    }

    const isGeometricDpadGlyph = el.classList.contains('dpad-btn') && directText.length <= 2;
    const fontSize = parseFloat(cs.fontSize);
    if (!isGeometricDpadGlyph && fontSize < 10.5) {
      failures.push({
        rule: 'FONT_TOO_SMALL',
        tag: el.tagName.toLowerCase(),
        cls: el.className,
        text: directText.slice(0, 48),
        detail: 'fontSize=' + fontSize.toFixed(2) + 'px < 10.5px',
      });
    }

    const surface = resolveSurfaceLayers(el);
    if (surface[3] < 0.55) {
      failures.push({
        rule: 'UNBACKED_TEXT_OVER_SCENERY',
        tag: el.tagName.toLowerCase(),
        cls: el.className,
        text: directText.slice(0, 48),
        detail: 'effectiveSurfaceAlpha=' + surface[3].toFixed(2) + ' < 0.55 (text needs solid or dark translucent card backing)',
      });
      continue;
    }

    const fgRaw = parseCssColor(cs.color);
    const elemOpacity = parseFloat(cs.opacity);
    const fgEffective = [fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * elemOpacity];

    const darkEnv = compositeOver(surface, [10, 14, 24, 1]);
    const brightEnv = surface[3] < 0.96 ? compositeOver(surface, [230, 232, 236, 1]) : darkEnv;

    const fgOnDark = compositeOver(fgEffective, darkEnv);
    const fgOnBright = compositeOver(fgEffective, brightEnv);

    const ratioDark = contrastRatio(fgOnDark, darkEnv);
    const ratioBright = contrastRatio(fgOnBright, brightEnv);
    const minRatio = Math.min(ratioDark, ratioBright);

    const fontWeight = parseInt(cs.fontWeight, 10) || 400;
    const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
    const threshold = isLargeText ? 3.0 : 4.5;

    if (!isGeometricDpadGlyph && minRatio < threshold) {
      failures.push({
        rule: 'LOW_CONTRAST_RATIO',
        tag: el.tagName.toLowerCase(),
        cls: el.className,
        text: directText.slice(0, 48),
        detail: 'contrast=' + minRatio.toFixed(2) + ':1 < ' + threshold + ':1 (fg=' + cs.color + ')',
      });
    }
  }

  return failures;
})()`;

async function runAudit() {
  const browserPath = findBrowserExecutable();
  const serverState = { authenticated: false };
  const { server, baseUrl } = await startDistServer(serverState);
  const debugPort = await allocateFreePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-audit-'));

  const browserProc = spawn(
    browserPath,
    [
      '--headless=new',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--no-sandbox',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const allFailures = [];
  let cdp = null;

  try {
    const wsUrl = await waitForPageTarget(debugPort);
    cdp = new CdpSession(wsUrl);
    await cdp.connect();

    const scenarios = [
      { name: 'home-closed', route: '/', auth: false, openPokedex: false },
      { name: 'home-open-pikachu', route: '/pokedex?q=pikachu', auth: false, openPokedex: true },
      { name: 'museu', route: '/museu', auth: false, openPokedex: false },
      { name: 'mundo-em-construcao', route: '/mundo', auth: true, openPokedex: false },
    ];

    const viewports = [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 375, height: 812 },
    ];

    for (const scenario of scenarios) {
      serverState.authenticated = scenario.auth;
      for (const vp of viewports) {
        await cdp.setViewport(vp.width, vp.height);
        await cdp.navigateAndWait(`${baseUrl}${scenario.route}`);

        if (scenario.openPokedex) {
          await cdp.evaluate('new Promise((r) => setTimeout(r, 1400))');
        }

        const pageFailures = await cdp.evaluate(AUDIT_PAGE_FN);
        if (cdp.consoleErrors.length > 0) {
          for (const errMsg of cdp.consoleErrors) {
            allFailures.push({
              scenario: `${scenario.name}@${vp.name}`,
              rule: 'CONSOLE_ERROR',
              detail: errMsg,
            });
          }
        }
        for (const f of pageFailures || []) {
          allFailures.push({
            scenario: `${scenario.name}@${vp.name}`,
            ...f,
          });
        }
      }
    }
  } finally {
    try {
      await cdp?.send('Browser.close');
    } catch {
    }
    try {
      cdp?.close();
    } catch {
    }
    try {
      browserProc.kill();
    } catch {
    }
    try {
      server.close();
    } catch {
    }
    await new Promise((r) => setTimeout(r, 200));
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
    }
  }

  if (allFailures.length > 0) {
    console.error(`UI Quality Gate FAILED with ${allFailures.length} issue(s):`);
    for (const item of allFailures) {
      console.error(JSON.stringify(item));
    }
    process.exit(1);
  }

  console.log('UI Quality Gate PASSED: 0 contrast, surface-backing, text-fit, overflow, or font-size violations across desktop & mobile.');
}

await runAudit();
