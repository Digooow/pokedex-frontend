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

const SAMPLE_PIKACHU_BUNDLE = {
  cache: 'hit',
  bundle: {
    pokemon: {
      id: 25,
      name: 'pikachu',
      order: 25,
      isDefault: true,
      height: 4,
      weight: 60,
      baseExperience: 112,
      baseStatTotal: 320,
      types: [{ slot: 1, type: { name: 'electric', url: 'https://pokeapi.co/api/v2/type/13/' } }],
      abilities: [{ is_hidden: false, slot: 1, ability: { name: 'static', url: 'https://pokeapi.co/api/v2/ability/9/' } }],
      stats: [{ base_stat: 35, effort: 0, stat: { name: 'hp', url: 'https://pokeapi.co/api/v2/stat/1/' } }],
      sprites: {
        officialArtwork: {
          frontDefault: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',
          frontShiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/25.png',
        },
        home: { frontDefault: null, frontShiny: null },
        showdown: {
          frontDefault: null, backDefault: null, frontShiny: null, backShiny: null,
          frontFemale: null, backFemale: null, frontShinyFemale: null, backShinyFemale: null,
        },
        default: {
          frontDefault: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
          backDefault: null, frontShiny: null, backShiny: null,
          frontFemale: null, backFemale: null, frontShinyFemale: null, backShinyFemale: null,
        },
        dreamWorld: { frontDefault: null, frontFemale: null },
      },
      historicalSprites: [],
      cries: { latest: null, legacy: null },
      moves: [],
      heldItems: [],
      pastTypes: [],
      pastAbilities: [],
      pastStats: [],
    },
    species: {
      id: 25,
      name: 'pikachu',
      genus: 'Mouse Pokémon',
      genera: [{ language: 'en', genus: 'Mouse Pokémon' }],
      flavorTexts: [{ version: 'red', language: 'en', text: 'Stores electricity in its cheeks.' }],
      captureRate: 190,
      baseHappiness: 70,
      genderRate: 4,
      hasGenderDifferences: true,
      hatchCounter: 10,
      growthRate: 'medium',
      color: 'yellow',
      shape: 'quadruped',
      habitat: 'forest',
      generation: 'generation-i',
      generationNumber: 1,
      isBaby: false,
      isLegendary: false,
      isMythical: false,
      formsSwitchable: false,
      eggGroups: ['field', 'fairy'],
      pokedexNumbers: [{ pokedex: 'kanto', entryNumber: 25 }],
      evolvesFromSpecies: null,
      varieties: [],
    },
    evolutionChain: null,
    typeEffectiveness: {
      multipliers: Object.fromEntries(
        ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy']
          .map((t) => [t, t === 'ground' ? 2 : 1]),
      ),
      quadWeak: [],
      weak: ['ground'],
      neutral: ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'],
      resistant: [],
      quadResistant: [],
      immune: [],
    },
  },
};

function findBrowserExecutable() {
  const envBin = process.env['CHROME_BIN']?.trim();
  const candidates = [
    ...(envBin ? [envBin] : []),
    String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
    String.raw`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
    String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
    String.raw`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
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

function sendJson(res, payload) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function buildAuthSessionPayload(authenticated) {
  if (!authenticated) {
    return { authenticated: false, canRefresh: false };
  }
  return {
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
  };
}

const EXACT_API_MOCKS = {
  '/health/ready': { status: 'ok', checks: { database: 'ok', redis: 'ok', kafka: 'ok' } },
  '/api/v1/system/bootstrap': { onlineCount: 1, latestEvent: null },
  '/api/v1/auth/providers': { googleEnabled: false, webauthnEnabled: true },
  '/api/v1/pokedex/catalog': SAMPLE_CATALOG,
  '/api/v1/pokedex/catalog/enriched': {
    cache: 'hit',
    source: 'graphql',
    degraded: false,
    count: 1,
    items: [
      {
        id: 25,
        name: 'pikachu',
        isDefault: true,
        types: ['electric'],
        generation: 1,
        habitat: 'forest',
        color: 'yellow',
        shape: 'quadruped',
        isLegendary: false,
        isMythical: false,
        isBaby: false,
        baseStatTotal: 320,
      },
    ],
  },
  '/api/v1/pokedex/meta/filters': {
    cache: 'hit',
    filters: {
      types: [{ id: 13, name: 'electric' }],
      generations: [{ id: 1, name: 'generation-i', regionName: 'kanto' }],
      habitats: [{ id: 2, name: 'forest' }],
      colors: [{ id: 10, name: 'yellow' }],
      shapes: [{ id: 8, name: 'quadruped' }],
      eggGroups: [{ id: 5, name: 'field' }],
      growthRates: [{ id: 2, name: 'medium' }],
      regions: [{ id: 1, name: 'kanto' }],
    },
  },
  '/api/v1/pokedex/slots': { slots: [] },
};

function resolveApiMockPayload(pathname, state) {
  if (pathname === '/api/v1/auth/session') {
    return buildAuthSessionPayload(state.authenticated);
  }
  if (Object.hasOwn(EXACT_API_MOCKS, pathname)) {
    return EXACT_API_MOCKS[pathname];
  }
  if (pathname.endsWith('/bundle')) {
    return SAMPLE_PIKACHU_BUNDLE;
  }
  if (pathname.endsWith('/encounters')) {
    return { cache: 'hit', pokemonId: 25, pokemonName: 'pikachu', encounters: [] };
  }
  if (pathname.endsWith('/forms')) {
    return {
      cache: 'hit',
      pokemonId: 25,
      pokemonName: 'pikachu',
      speciesName: 'pikachu',
      formsSwitchable: false,
      forms: [],
      varieties: [],
    };
  }
  if (pathname.startsWith('/api/v1/pokedex/regions/')) {
    const regionName = pathname.split('/').pop() || 'kanto';
    return {
      cache: 'hit',
      region: {
        id: 1,
        name: regionName,
        mainGeneration: 'generation-i',
        pokedexes: [{ id: 2, name: 'kanto' }],
        versionGroups: ['red-blue'],
        locations: [{ id: 86, name: 'pallet-town' }],
      },
    };
  }
  if (pathname.startsWith('/api/v1/pokedex/pokedexes/')) {
    return {
      cache: 'hit',
      pokedex: {
        id: 2,
        name: 'kanto',
        isMainSeries: true,
        region: 'kanto',
        description: 'Pokédex regional de Kanto.',
        versionGroups: ['red-blue'],
        totalEntries: 1,
        entries: [
          {
            entryNumber: 25,
            speciesId: 25,
            speciesName: 'pikachu',
            artworkUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',
          },
        ],
      },
    };
  }
  if (pathname === '/api/v1/pokedex/moves') {
    return {
      cache: 'hit',
      category: 'move',
      total: 1,
      limit: 24,
      offset: 0,
      hasMore: false,
      items: [{ id: 84, name: 'thunder-shock', displayName: 'Thunder Shock', subtitle: null }],
    };
  }
  if (pathname === '/api/v1/pokedex/moves/thunder-shock') {
    return {
      cache: 'hit',
      move: {
        id: 84,
        name: 'thunder-shock',
        displayName: 'Thunder Shock',
        type: 'electric',
        damageClass: 'special',
        power: 40,
        accuracy: 100,
        pp: 30,
        priority: 0,
        effectChance: 10,
        shortEffect: 'Has a 10% chance to paralyze the target.',
        learnedBy: [{ pokemonId: 25, pokemonName: 'pikachu' }],
      },
    };
  }
  if (pathname.startsWith('/api/v1/pokedex/pokemon/')) {
    return SAMPLE_PIKACHU;
  }
  return null;
}

function serveDistAsset(pathname, res) {
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
}

function startDistServer(state) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(path.join(DIST_BROWSER_DIR, 'index.html'))) {
      reject(new Error(`Missing Angular dist build at ${DIST_BROWSER_DIR}. Run npm run build:web first.`));
      return;
    }

    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const mockPayload = resolveApiMockPayload(reqUrl.pathname, state);
      if (mockPayload !== null) {
        sendJson(res, mockPayload);
        return;
      }
      serveDistAsset(reqUrl.pathname, res);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBrowserError(prefix, getStderr) {
  const stderr = getStderr().trim();
  return stderr ? `${prefix} stderr: ${stderr}` : prefix;
}

async function tryCreatePageTarget(port, method) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method,
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return null;
    const created = await response.json();
    return created?.webSocketDebuggerUrl ?? null;
  } catch {
    return null;
  }
}

async function createPageTarget(port) {
  return (await tryCreatePageTarget(port, 'PUT')) ?? (await tryCreatePageTarget(port, 'GET'));
}

async function probePageTarget(port, emptyListCount) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return { wsUrl: null, emptyListCount };

    const list = await response.json();
    const pageTarget = list.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
    if (pageTarget) {
      return { wsUrl: pageTarget.webSocketDebuggerUrl, emptyListCount };
    }

    const nextEmptyCount = emptyListCount + 1;
    const createdWsUrl = nextEmptyCount >= 5 ? await createPageTarget(port) : null;
    return { wsUrl: createdWsUrl, emptyListCount: nextEmptyCount };
  } catch {
    return { wsUrl: null, emptyListCount };
  }
}

async function waitForPageTarget(port, browserProc, getStderr, attempt = 0, emptyListCount = 0) {
  if (browserProc.exitCode !== null) {
    throw new Error(
      formatBrowserError(`Headless browser exited prematurely with code ${browserProc.exitCode}.`, getStderr),
    );
  }
  if (attempt >= 120) {
    throw new Error(formatBrowserError('Timed out waiting for headless browser DevTools endpoint.', getStderr));
  }

  const probe = await probePageTarget(port, emptyListCount);
  if (probe.wsUrl) {
    return probe.wsUrl;
  }

  await delay(200);
  return waitForPageTarget(port, browserProc, getStderr, attempt + 1, probe.emptyListCount);
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

const AUDIT_PAGE_FN = String.raw`(() => {
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
    const tokens = bgImage.match(/(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^()]+(?:\([^()]*\)[^()]*)*\)|#[0-9a-fA-F]{3,8}/g);
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

function buildBrowserArgs(debugPort, userDataDir) {
  const args = [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--password-store=basic',
    '--use-mock-keychain',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-hang-monitor',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-renderer-backgrounding',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--safebrowsing-disable-auto-update',
  ];

  if (process.platform === 'linux') {
    args.push('--disable-setuid-sandbox', '--no-zygote');
  }

  args.push('about:blank');
  return args;
}

async function cleanupBrowserAttempt(cdp, browserProc, userDataDir) {
  try {
    if (cdp) {
      await Promise.race([
        cdp.send('Browser.close'),
        new Promise((r) => setTimeout(r, 500)),
      ]);
    }
  } catch {
  }
  try {
    cdp?.close();
  } catch {
  }
  try {
    if (browserProc?.exitCode === null) {
      browserProc.kill();
    }
  } catch {
  }
  await new Promise((r) => setTimeout(r, 200));
  if (userDataDir) {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
    }
  }
}

async function launchBrowserWithRetry(browserPath, maxAttempts = 3, attempt = 1) {
  const debugPort = await allocateFreePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-audit-'));
  let stderrBuffer = '';
  let cdp = null;

  const browserProc = spawn(browserPath, buildBrowserArgs(debugPort, userDataDir), {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  browserProc.on('error', (err) => {
    stderrBuffer = `${stderrBuffer}\n[spawn error] ${err.message}`.slice(-8192);
  });
  browserProc.stderr?.on('data', (chunk) => {
    stderrBuffer = `${stderrBuffer}${chunk.toString('utf8')}`.slice(-8192);
  });

  try {
    const wsUrl = await waitForPageTarget(debugPort, browserProc, () => stderrBuffer);
    cdp = new CdpSession(wsUrl);
    await cdp.connect();
    return { cdp, browserProc, userDataDir };
  } catch (error) {
    await cleanupBrowserAttempt(cdp, browserProc, userDataDir);
    if (attempt >= maxAttempts) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`Browser launch attempt ${attempt}/${maxAttempts} failed (${msg}); retrying...`);
    return launchBrowserWithRetry(browserPath, maxAttempts, attempt + 1);
  }
}

async function runSingleAudit(cdp, baseUrl, serverState, scenario, viewport) {
  serverState.authenticated = scenario.auth;
  await cdp.setViewport(viewport.width, viewport.height);
  await cdp.navigateAndWait(`${baseUrl}${scenario.route}`);

  if (scenario.openPokedex) {
    await cdp.evaluate('new Promise((r) => setTimeout(r, 1400))');
  }

  const label = `${scenario.name}@${viewport.name}`;
  const pageFailures = await cdp.evaluate(AUDIT_PAGE_FN);
  const consoleFailures = cdp.consoleErrors.map((errMsg) => ({
    scenario: label,
    rule: 'CONSOLE_ERROR',
    detail: errMsg,
  }));
  const domFailures = (pageFailures || []).map((f) => ({ scenario: label, ...f }));
  return [...consoleFailures, ...domFailures];
}

async function runAuditRuns(cdp, baseUrl, serverState, runs, index = 0, acc = []) {
  if (index >= runs.length) return acc;
  const { scenario, viewport } = runs[index];
  const failures = await runSingleAudit(cdp, baseUrl, serverState, scenario, viewport);
  return runAuditRuns(cdp, baseUrl, serverState, runs, index + 1, [...acc, ...failures]);
}

async function runAudit() {
  const browserPath = findBrowserExecutable();
  const serverState = { authenticated: false };
  const { server, baseUrl } = await startDistServer(serverState);

  let allFailures = [];
  let browserSession = null;

  try {
    browserSession = await launchBrowserWithRetry(browserPath, 3);
    const { cdp } = browserSession;

    const scenarios = [
      { name: 'start-screen', route: '/', auth: false, openPokedex: false },
      { name: 'home-hub', route: '/inicio', auth: false, openPokedex: false },
      { name: 'pokedex-closed', route: '/pokedex', auth: false, openPokedex: false },
      { name: 'pokedex-open-pikachu', route: '/pokedex?q=pikachu', auth: false, openPokedex: true },
      { name: 'pokedex-calculator', route: '/pokedex?q=pikachu&mode=calculadora', auth: false, openPokedex: true },
      { name: 'pokedex-encyclopedia', route: '/pokedex?mode=enciclopedia', auth: false, openPokedex: true },
      { name: 'museu', route: '/museu', auth: false, openPokedex: false },
      { name: 'mundo-em-construcao', route: '/mundo', auth: true, openPokedex: false },
    ];

    const viewports = [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 375, height: 812 },
    ];

    const runs = scenarios.flatMap((scenario) => viewports.map((viewport) => ({ scenario, viewport })));
    allFailures = await runAuditRuns(cdp, baseUrl, serverState, runs);
  } finally {
    if (browserSession) {
      await cleanupBrowserAttempt(
        browserSession.cdp,
        browserSession.browserProc,
        browserSession.userDataDir,
      );
    }
    try {
      server.close();
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
