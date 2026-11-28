import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test as base } from '@playwright/test';
import type { CharacterSheet } from '@pokeverse/shared';
import { handleE2eCharacterRoute } from './bff-e2e-character.data';
import {
  SAMPLE_CATALOG,
  SAMPLE_PIKACHU,
  SAMPLE_PIKACHU_BUNDLE,
  SAMPLE_PIKACHU_ENCOUNTERS,
  SAMPLE_STATIC_ABILITY,
  SAMPLE_THUNDER_SHOCK_MOVE,
} from './bff-e2e-data';
import {
  SAMPLE_ELECTRIC_TYPE,
  SAMPLE_ENRICHED_CATALOG,
  SAMPLE_JOHTO_REGION,
  SAMPLE_KANTO_POKEDEX,
  SAMPLE_KANTO_REGION,
  SAMPLE_META_FILTERS,
  SAMPLE_MOVES_LIST,
  SAMPLE_TYPES_LIST,
} from './bff-e2e-encyclopedia.data';

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
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
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

const EXACT_POKEDEX_MOCKS: Readonly<Record<string, unknown>> = {
  '/api/v1/pokedex/catalog': SAMPLE_CATALOG,
  '/api/v1/pokedex/catalog/enriched': SAMPLE_ENRICHED_CATALOG,
  '/api/v1/pokedex/meta/filters': SAMPLE_META_FILTERS,
  '/api/v1/pokedex/moves': SAMPLE_MOVES_LIST,
  '/api/v1/pokedex/types': SAMPLE_TYPES_LIST,
  '/api/v1/pokedex/types/electric': SAMPLE_ELECTRIC_TYPE,
};

const PREFIX_POKEDEX_MOCKS: ReadonlyArray<readonly [string, unknown]> = [
  ['/api/v1/pokedex/moves/', SAMPLE_THUNDER_SHOCK_MOVE],
  ['/api/v1/pokedex/abilities/', SAMPLE_STATIC_ABILITY],
  ['/api/v1/pokedex/pokedexes/', SAMPLE_KANTO_POKEDEX],
  ['/api/v1/pokedex/pokemon/', SAMPLE_PIKACHU],
];

async function handlePokedexRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  slots: Map<number, SavedSlotRecord>,
): Promise<boolean> {
  if (Object.hasOwn(EXACT_POKEDEX_MOCKS, pathname)) {
    writeJson(res, 200, EXACT_POKEDEX_MOCKS[pathname]);
    return true;
  }
  if (pathname.endsWith('/bundle')) {
    writeJson(res, 200, SAMPLE_PIKACHU_BUNDLE);
    return true;
  }
  if (pathname.endsWith('/encounters')) {
    writeJson(res, 200, SAMPLE_PIKACHU_ENCOUNTERS);
    return true;
  }
  if (pathname.endsWith('/forms')) {
    writeJson(res, 200, {
      cache: 'hit',
      pokemonId: 25,
      pokemonName: 'pikachu',
      speciesName: 'pikachu',
      formsSwitchable: false,
      forms: [],
      varieties: SAMPLE_PIKACHU_BUNDLE.bundle.species.varieties,
    });
    return true;
  }
  if (pathname.startsWith('/api/v1/pokedex/regions/')) {
    writeJson(res, 200, pathname.endsWith('/johto') ? SAMPLE_JOHTO_REGION : SAMPLE_KANTO_REGION);
    return true;
  }
  const matchedPrefix = PREFIX_POKEDEX_MOCKS.find(([prefix]) => pathname.startsWith(prefix));
  if (matchedPrefix) {
    writeJson(res, 200, matchedPrefix[1]);
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
  characters: Map<string, CharacterSheet>,
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
  if (
    await handleE2eCharacterRoute({
      req,
      res,
      pathname,
      characters,
      readRequestBody,
      writeJson,
    })
  ) {
    return true;
  }
  return handlePokedexRoute(req, res, pathname, slots);
}

function buildMinimalGlbBuffer(): Buffer {
  const jsonBytes = Buffer.from(
    JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }] }),
    'utf8',
  );
  const padLen = (4 - (jsonBytes.length % 4)) % 4;
  const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc(padLen, 0x20)]);
  const totalLen = 12 + 8 + paddedJson.length;
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);
  header.writeUInt32LE(paddedJson.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, paddedJson]);
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

    const minimalGlb = buildMinimalGlbBuffer();
    await page.route('https://raw.githubusercontent.com/Pokemon-3D-api/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'model/gltf-binary',
        body: minimalGlb,
      }),
    );

    await page.routeWebSocket(/\/socket\.io\//, (ws) => {
      ws.send('0{"sid":"e2e-ws","upgrades":[],"pingInterval":25000,"pingTimeout":20000}');
      ws.onMessage((message) => {
        if (typeof message === 'string' && message.startsWith('40')) {
          ws.send('40/ws/world,{"sid":"e2e-world"}');
        }
      });
    });

    const slots = new Map<number, SavedSlotRecord>();
    const characters = new Map<string, CharacterSheet>();
    const server = http.createServer((req, res) => {
      const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
      void handleApiRoute(req, res, pathname, slots, characters).then((handled) => {
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

    server.close();
    server.closeAllConnections();
  },
});

export { expect } from '@playwright/test';
