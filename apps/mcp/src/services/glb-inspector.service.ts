import fs from 'node:fs';
import { resolveSafeWorkspacePath } from '../utils/path-sandbox.util.js';

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const GLB_HEADER_BYTES = 12;
const MAX_GLB_INSPECT_BYTES = 64 * 1024 * 1024;

interface GltfAccessor {
  readonly count?: number;
}

interface GltfPrimitive {
  readonly attributes?: Readonly<Record<string, number>>;
  readonly indices?: number;
  readonly material?: number;
}

interface GltfMesh {
  readonly name?: string;
  readonly primitives?: readonly GltfPrimitive[];
}

interface GltfImage {
  readonly name?: string;
  readonly mimeType?: string;
  readonly uri?: string;
}

interface GltfAnimation {
  readonly name?: string;
}

interface GltfSkin {
  readonly name?: string;
  readonly joints?: readonly number[];
}

interface GltfDocumentJson {
  readonly asset?: { readonly version?: string; readonly generator?: string };
  readonly extensionsUsed?: readonly string[];
  readonly extensionsRequired?: readonly string[];
  readonly accessors?: readonly GltfAccessor[];
  readonly meshes?: readonly GltfMesh[];
  readonly materials?: ReadonlyArray<{ readonly name?: string }>;
  readonly images?: readonly GltfImage[];
  readonly animations?: readonly GltfAnimation[];
  readonly skins?: readonly GltfSkin[];
}

export type GlbBudgetStatus = 'ok' | 'warn' | 'over-budget';

export interface GlbInspectionReport {
  readonly file: string;
  readonly sizeBytes: number;
  readonly sizeKb: number;
  readonly gltfVersion: string;
  readonly generator: string;
  readonly meshCount: number;
  readonly primitiveCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly materialCount: number;
  readonly textureImageCount: number;
  readonly embeddedMimeTypes: readonly string[];
  readonly skinCount: number;
  readonly maxJointsPerSkin: number;
  readonly animationClips: readonly string[];
  readonly extensionsUsed: readonly string[];
  readonly dracoCompressed: boolean;
  readonly ktx2Compressed: boolean;
  readonly budgetStatus: GlbBudgetStatus;
  readonly recommendations: readonly string[];
}

function parseGlbJsonChunk(buffer: Buffer): GltfDocumentJson {
  if (buffer.byteLength < GLB_HEADER_BYTES + 8) {
    throw new Error('Buffer is too small to be a valid GLB 2.0 binary.');
  }
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error('Invalid GLB header magic (expected glTF).');
  }
  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    throw new Error(`Unsupported GLB version ${version}; expected version 2.`);
  }
  const chunkLength = buffer.readUInt32LE(12);
  const chunkType = buffer.readUInt32LE(16);
  if (chunkType !== GLB_JSON_CHUNK_TYPE) {
    throw new Error('First GLB chunk is not JSON.');
  }
  const jsonStart = 20;
  const jsonEnd = jsonStart + chunkLength;
  if (jsonEnd > buffer.byteLength) {
    throw new Error('GLB JSON chunk length exceeds file size.');
  }
  return JSON.parse(buffer.subarray(jsonStart, jsonEnd).toString('utf8')) as GltfDocumentJson;
}

function computeGeometryMetrics(json: GltfDocumentJson) {
  const accessors = json.accessors ?? [];
  const meshes = json.meshes ?? [];
  let primitiveCount = 0;
  let vertexCount = 0;
  let triangleCount = 0;

  for (const mesh of meshes) {
    const primitives = mesh.primitives ?? [];
    primitiveCount += primitives.length;
    for (const prim of primitives) {
      const posIndex = prim.attributes?.['POSITION'];
      const posCount = typeof posIndex === 'number' ? (accessors[posIndex]?.count ?? 0) : 0;
      vertexCount += posCount;

      const idxCount =
        typeof prim.indices === 'number' ? (accessors[prim.indices]?.count ?? 0) : posCount;
      triangleCount += Math.floor(idxCount / 3);
    }
  }

  return { meshCount: meshes.length, primitiveCount, vertexCount, triangleCount };
}

function buildRecommendations(params: {
  readonly sizeKb: number;
  readonly triangleCount: number;
  readonly dracoCompressed: boolean;
  readonly ktx2Compressed: boolean;
  readonly textureImageCount: number;
  readonly maxJointsPerSkin: number;
}): { readonly status: GlbBudgetStatus; readonly recommendations: string[] } {
  const recommendations: string[] = [];
  if (params.sizeKb > 2048) {
    recommendations.push('Asset exceeds 2 MB mobile budget; decimate or split LODs in Blender.');
  }
  if (!params.dracoCompressed && params.triangleCount > 2500) {
    recommendations.push('Enable Draco mesh compression on Blender glTF export for faster loads.');
  }
  if (params.textureImageCount > 0 && !params.ktx2Compressed) {
    recommendations.push('Consider KTX2/BasisU or WebP textures to cut GPU VRAM on mobile.');
  }
  if (params.triangleCount > 60_000) {
    recommendations.push(
      'Triangle count > 60k may hurt mobile WebGL FPS; bake normal maps instead.',
    );
  }
  if (params.maxJointsPerSkin > 64) {
    recommendations.push('Skin exceeds 64 bones; keep <= 64 bones for broad WebGL2 skinning.');
  }

  let status: GlbBudgetStatus = 'ok';
  if (params.sizeKb > 5120 || params.triangleCount > 80_000) {
    status = 'over-budget';
  } else if (recommendations.length > 0) {
    status = 'warn';
  }
  return { status, recommendations };
}

export function inspectGlbBuffer(relativeFile: string, buffer: Buffer): GlbInspectionReport {
  const json = parseGlbJsonChunk(buffer);
  const geometry = computeGeometryMetrics(json);
  const extensionsUsed = [...(json.extensionsUsed ?? [])];
  const dracoCompressed = extensionsUsed.includes('KHR_draco_mesh_compression');
  const ktx2Compressed = extensionsUsed.includes('KHR_texture_basisu');
  const images = json.images ?? [];
  const mimeSet = new Set(images.map((img) => img.mimeType ?? 'external-uri').filter(Boolean));
  const skins = json.skins ?? [];
  const maxJointsPerSkin = skins.reduce((max, skin) => Math.max(max, skin.joints?.length ?? 0), 0);
  const animationClips = (json.animations ?? []).map(
    (clip, idx) => clip.name?.trim() || `clip_${idx}`,
  );
  const sizeKb = Number((buffer.byteLength / 1024).toFixed(2));
  const { status, recommendations } = buildRecommendations({
    sizeKb,
    triangleCount: geometry.triangleCount,
    dracoCompressed,
    ktx2Compressed,
    textureImageCount: images.length,
    maxJointsPerSkin,
  });

  return {
    file: relativeFile,
    sizeBytes: buffer.byteLength,
    sizeKb,
    gltfVersion: json.asset?.version ?? 'unknown',
    generator: json.asset?.generator ?? 'unknown',
    meshCount: geometry.meshCount,
    primitiveCount: geometry.primitiveCount,
    vertexCount: geometry.vertexCount,
    triangleCount: geometry.triangleCount,
    materialCount: (json.materials ?? []).length,
    textureImageCount: images.length,
    embeddedMimeTypes: Array.from(mimeSet),
    skinCount: skins.length,
    maxJointsPerSkin,
    animationClips,
    extensionsUsed,
    dracoCompressed,
    ktx2Compressed,
    budgetStatus: status,
    recommendations,
  };
}

export function inspectWorkspaceGlbAsset(
  repoRoot: string,
  relativePath: string,
): GlbInspectionReport {
  const { fullPath, relativePosix } = resolveSafeWorkspacePath({ repoRoot, relativePath });
  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) {
    throw new Error(`Target is not a file: ${relativePosix}`);
  }
  if (stat.size > MAX_GLB_INSPECT_BYTES) {
    throw new Error(`GLB exceeds 64 MB inspection cap (${stat.size} bytes).`);
  }
  return inspectGlbBuffer(relativePosix, fs.readFileSync(fullPath));
}
