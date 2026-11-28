import fs from 'node:fs';
import path from 'node:path';
import {
  ALLOWED_TEXTURE_WRITE_PREFIX,
  resolveSafeWorkspacePath,
  toPosixRelative,
} from '../utils/path-sandbox.util.js';

const TEXTURE_EXTENSIONS = new Set(['.webp', '.png', '.jpg', '.jpeg', '.svg', '.ktx2']);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export type ProceduralTexturePattern =
  'grid' | 'hex-holo' | 'metal-brushed' | 'scanline-hud' | 'checker-uv';

export interface TextureAssetEntry {
  readonly file: string;
  readonly extension: string;
  readonly sizeKb: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly powerOfTwo: boolean | null;
  readonly warnings: readonly string[];
}

export interface TextureDirectoryAudit {
  readonly directory: string;
  readonly totalFiles: number;
  readonly totalSizeKb: number;
  readonly entries: readonly TextureAssetEntry[];
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function readPngDimensions(buf: Buffer): readonly [number, number] | null {
  if (buf.byteLength < 24 || buf.readUInt32BE(0) !== 0x89504e47) {
    return null;
  }
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

function readWebpDimensions(buf: Buffer): readonly [number, number] | null {
  if (buf.byteLength < 30 || buf.subarray(0, 4).toString('ascii') !== 'RIFF') {
    return null;
  }
  const chunkTag = buf.subarray(12, 16).toString('ascii');
  if (chunkTag === 'VP8X' && buf.byteLength >= 30) {
    const width = 1 + buf.readUIntLE(24, 3);
    const height = 1 + buf.readUIntLE(27, 3);
    return [width, height];
  }
  if (chunkTag === 'VP8 ' && buf.byteLength >= 30) {
    return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  }
  if (chunkTag === 'VP8L' && buf.byteLength >= 25) {
    const bits = buf.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  return null;
}

function readKtx2Dimensions(buf: Buffer): readonly [number, number] | null {
  if (buf.byteLength < 28 || buf.readUInt32BE(0) !== 0xab4b5458) {
    return null;
  }
  return [buf.readUInt32LE(20), buf.readUInt32LE(24)];
}

function readTextureDimensions(ext: string, buf: Buffer): readonly [number, number] | null {
  if (ext === '.png') return readPngDimensions(buf);
  if (ext === '.webp') return readWebpDimensions(buf);
  if (ext === '.ktx2') return readKtx2Dimensions(buf);
  return null;
}

function buildTextureWarnings(
  ext: string,
  sizeKb: number,
  dims: readonly [number, number] | null,
): string[] {
  const warnings: string[] = [];
  if (sizeKb > 512) {
    warnings.push('Texture exceeds 512 KB; compress to WebP or KTX2 for web games.');
  }
  if (ext === '.png' && sizeKb > 150) {
    warnings.push('Large PNG texture; convert to WebP/KTX2 to reduce download & VRAM.');
  }
  if (dims) {
    const [w, h] = dims;
    if (!isPowerOfTwo(w) || !isPowerOfTwo(h)) {
      warnings.push(`Dimensions ${w}x${h} are non-power-of-two (suboptimal for 3D mipmaps).`);
    }
    if (w > 2048 || h > 2048) {
      warnings.push(`Resolution ${w}x${h} exceeds 2048px mobile GPU budget.`);
    }
  }
  return warnings;
}

function collectFilesRecursive(dirPath: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursive(full, out);
    } else if (TEXTURE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

export function inspectTextureDirectory(
  repoRoot: string,
  relativeDir = 'apps/web/public/assets',
): TextureDirectoryAudit {
  const { fullPath, relativePosix } = resolveSafeWorkspacePath({
    repoRoot,
    relativePath: relativeDir,
  });
  const files = collectFilesRecursive(fullPath).sort((a, b) => a.localeCompare(b));

  const entries: TextureAssetEntry[] = files.map((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const buf = fs.readFileSync(filePath);
    const sizeKb = Number((buf.byteLength / 1024).toFixed(2));
    const dims = readTextureDimensions(ext, buf);
    const powerOfTwo = dims ? isPowerOfTwo(dims[0]) && isPowerOfTwo(dims[1]) : null;
    return {
      file: toPosixRelative(repoRoot, filePath),
      extension: ext,
      sizeKb,
      width: dims?.[0] ?? null,
      height: dims?.[1] ?? null,
      powerOfTwo,
      warnings: buildTextureWarnings(ext, sizeKb, dims),
    };
  });

  const totalSizeKb = Number(entries.reduce((sum, item) => sum + item.sizeKb, 0).toFixed(2));
  return {
    directory: relativePosix,
    totalFiles: entries.length,
    totalSizeKb,
    entries,
  };
}

function assertHexColor(color: string, label: string): string {
  const trimmed = color.trim();
  if (!HEX_COLOR_RE.test(trimmed)) {
    throw new Error(`Invalid ${label} hex color "${color}"; expected #RRGGBB.`);
  }
  return trimmed.toLowerCase();
}

function renderPatternSvgBody(params: {
  readonly pattern: ProceduralTexturePattern;
  readonly size: number;
  readonly primary: string;
  readonly secondary: string;
}): string {
  const { pattern, size, primary, secondary } = params;
  const cell = Math.max(16, Math.floor(size / 8));
  if (pattern === 'checker-uv') {
    return [
      `<defs><pattern id="chk" width="${cell * 2}" height="${cell * 2}" patternUnits="userSpaceOnUse">`,
      `<rect width="${cell}" height="${cell}" fill="${primary}"/>`,
      `<rect x="${cell}" y="${cell}" width="${cell}" height="${cell}" fill="${primary}"/>`,
      `<rect x="${cell}" width="${cell}" height="${cell}" fill="${secondary}"/>`,
      `<rect y="${cell}" width="${cell}" height="${cell}" fill="${secondary}"/>`,
      `</pattern></defs><rect width="100%" height="100%" fill="url(#chk)"/>`,
    ].join('');
  }
  if (pattern === 'scanline-hud') {
    return [
      `<defs><pattern id="scan" width="4" height="8" patternUnits="userSpaceOnUse">`,
      `<rect width="4" height="4" fill="${primary}" fill-opacity="0.22"/>`,
      `</pattern></defs><rect width="100%" height="100%" fill="${secondary}"/>`,
      `<rect width="100%" height="100%" fill="url(#scan)"/>`,
    ].join('');
  }
  if (pattern === 'hex-holo') {
    const r = Math.max(12, Math.floor(size / 16));
    const h = Math.round(r * 1.732);
    return [
      `<defs><pattern id="hex" width="${r * 3}" height="${h}" patternUnits="userSpaceOnUse">`,
      `<path d="M${r},0 L${r * 2},0 L${r * 2.5},${h / 2} L${r * 2},${h} L${r},${h} L${r * 0.5},${h / 2} Z" fill="none" stroke="${primary}" stroke-width="1.5" stroke-opacity="0.72"/>`,
      `</pattern></defs><rect width="100%" height="100%" fill="${secondary}"/>`,
      `<rect width="100%" height="100%" fill="url(#hex)"/>`,
    ].join('');
  }
  if (pattern === 'metal-brushed') {
    return [
      `<defs><linearGradient id="mb" x1="0" y1="0" x2="1" y2="1">`,
      `<stop offset="0%" stop-color="${secondary}"/><stop offset="50%" stop-color="${primary}" stop-opacity="0.35"/><stop offset="100%" stop-color="${secondary}"/>`,
      `</linearGradient></defs><rect width="100%" height="100%" fill="url(#mb)"/>`,
    ].join('');
  }
  return [
    `<defs><pattern id="grd" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse">`,
    `<path d="M ${cell} 0 L 0 0 0 ${cell}" fill="none" stroke="${primary}" stroke-width="1.5" stroke-opacity="0.6"/>`,
    `</pattern></defs><rect width="100%" height="100%" fill="${secondary}"/>`,
    `<rect width="100%" height="100%" fill="url(#grd)"/>`,
  ].join('');
}

export function generateProceduralTextureAsset(params: {
  readonly repoRoot: string;
  readonly pattern: ProceduralTexturePattern;
  readonly size: number;
  readonly primaryHex: string;
  readonly secondaryHex: string;
  readonly outputRelativePath?: string;
}) {
  const primary = assertHexColor(params.primaryHex, 'primaryHex');
  const secondary = assertHexColor(params.secondaryHex, 'secondaryHex');
  const svgBody = renderPatternSvgBody({
    pattern: params.pattern,
    size: params.size,
    primary,
    secondary,
  });
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${params.size}" height="${params.size}" viewBox="0 0 ${params.size} ${params.size}">`,
    svgBody,
    '</svg>',
  ].join('');

  let writtenPath: string | null = null;
  if (params.outputRelativePath) {
    const { fullPath, relativePosix } = resolveSafeWorkspacePath({
      repoRoot: params.repoRoot,
      relativePath: params.outputRelativePath,
      allowedPrefixes: [ALLOWED_TEXTURE_WRITE_PREFIX],
    });
    if (!relativePosix.endsWith('.svg')) {
      throw new Error('Procedural texture output file must use .svg extension.');
    }
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, svg, 'utf8');
    writtenPath = relativePosix;
  }

  return {
    pattern: params.pattern,
    size: params.size,
    powerOfTwo: isPowerOfTwo(params.size),
    writtenPath,
    babylonUsageHint: `new Texture('${writtenPath ?? '/assets/textures/generated/sample.svg'}', scene)`,
    svg,
  };
}
