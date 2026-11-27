import { type AnimationClip, Box3, type Object3D, Vector3 } from 'three';
import type { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface HolocronAnimationClipInfo {
  readonly index: number;
  readonly label: string;
}

export type HolocronMediaKind = 'loading' | 'glb-animated' | 'glb-procedural' | 'prism-2d';

export interface HolocronMediaState {
  readonly kind: HolocronMediaKind;
  readonly animations: readonly HolocronAnimationClipInfo[];
  readonly activeAnimationIndex: number;
}

export interface ProceduralRig {
  readonly target: Object3D;
  readonly baseScale: number;
  readonly baseY: number;
}

export interface LoadedGlbPayload {
  readonly url: string;
  readonly gltf: GLTF;
}

const IDLE_CLIP_HINTS = ['idle', 'stand', 'wait', 'breathe'];
const DRACO_DECODER_PATH = '/assets/draco/';

function stripLeadingDigitsAndVariant(token: string): string {
  let idx = 0;
  while (idx < token.length && token.charCodeAt(idx) >= 48 && token.charCodeAt(idx) <= 57) {
    idx += 1;
  }
  if (idx === 0) return token;
  const rest = token.slice(idx);
  if (rest.length > 1 && rest.startsWith('a') && rest.slice(1).length >= 3) {
    return rest.slice(1);
  }
  return rest;
}

export function formatAnimationClipLabel(rawName: string, index: number): string {
  const segment = (rawName.split('|').pop() ?? '').trim();
  const withoutPrefix = stripLeadingDigitsAndVariant(segment);
  const spaced = withoutPrefix.replaceAll('_', ' ').replaceAll('-', ' ').trim();
  if (!spaced) return `Animação ${index + 1}`;
  return spaced
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

export function pickDefaultClipIndex(clips: readonly AnimationClip[]): number {
  if (clips.length === 0) return -1;
  const preferredIdx = clips.findIndex((clip) => {
    const lower = clip.name.toLowerCase();
    return IDLE_CLIP_HINTS.some((hint) => lower.includes(hint));
  });
  return preferredIdx >= 0 ? preferredIdx : 0;
}

export function applyProceduralIdleMotion(
  rig: ProceduralRig,
  elapsedSec: number,
  energy: number,
  reducedMotion: boolean,
): void {
  if (reducedMotion) {
    rig.target.scale.setScalar(rig.baseScale);
    rig.target.position.y = rig.baseY;
    rig.target.rotation.set(0, 0, 0);
    return;
  }
  const breath = Math.sin(elapsedSec * 2.6);
  const scaleY = rig.baseScale * (1 + breath * 0.032 + energy * 0.065);
  const scaleXz = rig.baseScale * (1 - breath * 0.015);
  rig.target.scale.set(scaleXz, scaleY, scaleXz);
  rig.target.rotation.z = Math.sin(elapsedSec * 1.55) * 0.045;
  rig.target.rotation.x = Math.sin(elapsedSec * 2.1) * 0.03;
  rig.target.position.y = rig.baseY + Math.abs(Math.sin(elapsedSec * 2.1)) * 0.04 + energy * 0.07;
}

export function fitLoadedGlbModel(model: Object3D): {
  readonly baseScale: number;
  readonly baseY: number;
} {
  model.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model);
  if (box.isEmpty()) return { baseScale: 1, baseY: -0.58 };
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const scale = 1.52 / maxDim;
  const baseY = -0.54 - box.min.y * scale;
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, baseY, -center.z * scale);
  return { baseScale: scale, baseY };
}

export function hasRenderableGeometry(model: Object3D): boolean {
  model.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model);
  if (box.isEmpty()) return false;
  const size = new Vector3();
  box.getSize(size);
  return size.lengthSq() > 0.0001;
}

export function createLazyGlbLoader() {
  let cachedLoader: GLTFLoader | null = null;
  let cachedDraco: DRACOLoader | null = null;

  return {
    async getLoader(): Promise<GLTFLoader> {
      if (cachedLoader) return cachedLoader;
      const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/loaders/DRACOLoader.js'),
      ]);
      const draco = new DRACOLoader();
      draco.setDecoderPath(DRACO_DECODER_PATH);
      draco.setWorkerLimit(2);
      const gltfLoader = new GLTFLoader();
      gltfLoader.setDRACOLoader(draco);
      cachedDraco = draco;
      cachedLoader = gltfLoader;
      return gltfLoader;
    },
    dispose() {
      cachedDraco?.dispose();
      cachedDraco = null;
      cachedLoader = null;
    },
  };
}

export async function fetchFirstValidGlb(params: {
  readonly candidates: readonly string[];
  readonly index: number;
  readonly signal: AbortSignal;
  readonly isStale: () => boolean;
  readonly getLoader: () => Promise<GLTFLoader>;
  readonly onDispose: (obj: Object3D) => void;
}): Promise<LoadedGlbPayload | null> {
  const { candidates, index, signal, isStale, getLoader, onDispose } = params;
  const url = candidates[index];
  if (!url || isStale() || signal.aborted) return null;

  try {
    const response = await fetch(url, { signal, mode: 'cors' });
    if (!response.ok || isStale()) {
      return fetchFirstValidGlb({ ...params, index: index + 1 });
    }
    const buffer = await response.arrayBuffer();
    if (isStale()) return null;
    const loader = await getLoader();
    if (isStale()) return null;
    const gltf = await loader.parseAsync(buffer, '');
    if (isStale() || !hasRenderableGeometry(gltf.scene)) {
      onDispose(gltf.scene);
      return isStale() ? null : fetchFirstValidGlb({ ...params, index: index + 1 });
    }
    return { url, gltf };
  } catch {
    if (isStale() || signal.aborted) return null;
    return fetchFirstValidGlb({ ...params, index: index + 1 });
  }
}
