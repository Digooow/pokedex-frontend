import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test as base } from '@playwright/test';

const DIST_DIR = path.resolve(__dirname, '..', 'dist', 'pokeverse-web', 'browser');

const MIME_TYPES: Readonly<Record<string, string>> = {
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
    count: 3,
    results: [
      { name: 'bulbasaur', url: 'https://pokeapi.co/api/v2/pokemon/1/' },
      { name: 'charmander', url: 'https://pokeapi.co/api/v2/pokemon/4/' },
      { name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon/25/' },
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
    abilities: [
      {
        is_hidden: false,
        slot: 1,
        ability: { name: 'static', url: 'https://pokeapi.co/api/v2/ability/9/' },
      },
    ],
    stats: [
      { base_stat: 35, effort: 0, stat: { name: 'hp', url: 'https://pokeapi.co/api/v2/stat/1/' } },
    ],
    sprites: {
      front_default:
        'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
      other: {
        'official-artwork': {
          front_default:
            'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',
        },
      },
    },
  },
};

interface SavedSlotRecord {
  readonly slotIndex: number;
  readonly pokemonId: number;
  readonly pokemonName: string;
  readonly nickname: string | null;
  readonly spriteUrl: string | null;
  readonly updatedAt: string;
}

function createTrainerPayload() {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    username: 'Red_Kanto',
    email: 'red@pokeverse.dev',
    emailVerifiedAt: new Date().toISOString(),
    mfaEnabled: false,
    hasPassword: true,
    role: 'TRAINER',
    badgesCount: 3,
    eloRating: 1240,
    lastMapId: 'pokeverse-town',
    lastX: 400,
    lastY: 320,
    createdAt: new Date().toISOString(),
  };
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function writeJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function serveStaticAsset(pathname: string, res: http.ServerResponse): void {
  const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let targetPath = path.resolve(DIST_DIR, relPath);
  if (!targetPath.startsWith(DIST_DIR)) {
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
    targetPath = path.join(DIST_DIR, 'index.html');
  }
  const ext = path.extname(targetPath);
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
  fs.createReadStream(targetPath).pipe(res);
}

function handleAuthRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): boolean {
  const hasSessionCookie = (req.headers.cookie ?? '').includes('pokeverse_session=e2e-sid-1');

  if (pathname === '/api/v1/auth/providers') {
    writeJson(res, 200, { googleEnabled: false, webauthnEnabled: true });
    return true;
  }
  if (pathname === '/api/v1/auth/session') {
    const body = hasSessionCookie
      ? {
          authenticated: true,
          sessionState: 'AUTHENTICATED',
          mfaMethods: [],
          expiresInSec: 900,
          trainer: createTrainerPayload(),
        }
      : { authenticated: false, canRefresh: false };
    writeJson(res, 200, body);
    return true;
  }
  if (pathname === '/api/v1/auth/login' && req.method === 'POST') {
    writeJson(
      res,
      200,
      {
        authenticated: true,
        sessionState: 'AUTHENTICATED',
        mfaMethods: [],
        expiresInSec: 900,
        trainer: createTrainerPayload(),
      },
      { 'Set-Cookie': 'pokeverse_session=e2e-sid-1; HttpOnly; Path=/; SameSite=Lax' },
    );
    return true;
  }
  if (pathname === '/api/v1/auth/logout' && req.method === 'POST') {
    res.writeHead(204, { 'Set-Cookie': 'pokeverse_session=; HttpOnly; Path=/; Max-Age=0' });
    res.end();
    return true;
  }
  return false;
}

async function handlePokedexRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  slots: Map<number, SavedSlotRecord>,
): Promise<boolean> {
  if (pathname === '/api/v1/pokedex/catalog') {
    writeJson(res, 200, SAMPLE_CATALOG);
    return true;
  }
  if (pathname.startsWith('/api/v1/pokedex/pokemon/')) {
    writeJson(res, 200, SAMPLE_PIKACHU);
    return true;
  }
  if (pathname === '/api/v1/pokedex/slots' && req.method === 'GET') {
    writeJson(res, 200, { slots: Array.from(slots.values()) });
    return true;
  }
  if (pathname.startsWith('/api/v1/pokedex/slots/') && req.method === 'PUT') {
    const idx = Number(pathname.split('/').pop());
    const raw = await readRequestBody(req);
    const body = JSON.parse(raw) as {
      pokemonId: number;
      pokemonName: string;
      nickname?: string | null;
      spriteUrl?: string | null;
    };
    const saved: SavedSlotRecord = {
      slotIndex: idx,
      pokemonId: body.pokemonId,
      pokemonName: body.pokemonName,
      nickname: body.nickname ?? null,
      spriteUrl: body.spriteUrl ?? null,
      updatedAt: new Date().toISOString(),
    };
    slots.set(idx, saved);
    writeJson(res, 200, saved);
    return true;
  }
  return false;
}

async function handleApiRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  slots: Map<number, SavedSlotRecord>,
): Promise<boolean> {
  if (pathname === '/health/ready') {
    writeJson(res, 200, {
      status: 'ok',
      service: 'pokeverse-api',
      timestamp: new Date().toISOString(),
      uptimeSec: 12,
      dependencies: {
        postgres: { status: 'up', latencyMs: 1 },
        redis: { status: 'up', latencyMs: 1 },
        kafka: { status: 'up', latencyMs: 2 },
        s3: { status: 'up', latencyMs: 2 },
      },
    });
    return true;
  }
  if (pathname === '/api/v1/system/bootstrap') {
    writeJson(res, 200, { service: 'pokeverse-api', phase: 'phase-2b', modules: [] });
    return true;
  }
  if (pathname.startsWith('/api/v1/telemetry/')) {
    writeJson(res, 202, { accepted: true, count: 1 });
    return true;
  }
  if (handleAuthRoute(req, res, pathname)) {
    return true;
  }
  return handlePokedexRoute(req, res, pathname, slots);
}

export interface BffE2eHarness {
  readonly baseUrl: string;
  readonly consoleErrors: string[];
}

export const test = base.extend<{ bff: BffE2eHarness }>({
  bff: async ({ page }, provide) => {
    if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
      throw new Error(`Missing production build at ${DIST_DIR}. Run npm run build:web first.`);
    }

    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.routeWebSocket(/\/socket\.io\//, (ws) => {
      ws.send('0{"sid":"e2e-ws","upgrades":[],"pingInterval":25000,"pingTimeout":20000}');
      ws.onMessage((message) => {
        if (typeof message === 'string' && message.startsWith('40')) {
          ws.send('40/ws/world,{"sid":"e2e-world"}');
        }
      });
    });

    const slots = new Map<number, SavedSlotRecord>();
    const server = http.createServer((req, res) => {
      const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
      void handleApiRoute(req, res, pathname, slots).then((handled) => {
        if (!handled) {
          serveStaticAsset(pathname, res);
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to bind local Playwright E2E HTTP server.');
    }

    await provide({
      baseUrl: `http://127.0.0.1:${addr.port}`,
      consoleErrors,
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  },
});

export { expect } from '@playwright/test';
