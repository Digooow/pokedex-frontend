import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import '@babylonjs/loaders/glTF';
import { ensureSelfHostedDraco } from '../../core/engine-ports/babylon-stage.util';

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
  readonly target: TransformNode;
  readonly baseScale: number;
  readonly baseY: number;
}

export interface LoadedGlbPayload {
  readonly url: string;
  readonly container: AssetContainer;
  readonly root: TransformNode;
}

const IDLE_CLIP_HINTS = ['idle', 'stand', 'wait', 'breathe'];
const ASCII_DIGIT_MIN = 48;
const ASCII_DIGIT_MAX = 57;

function stripLeadingDigitsAndVariant(token: string): string {
  let idx = 0;
  while (idx < token.length) {
    const code = token.codePointAt(idx) ?? -1;
    if (code < ASCII_DIGIT_MIN || code > ASCII_DIGIT_MAX) break;
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

export function pickDefaultClipIndex(groups: ReadonlyArray<{ readonly name: string }>): number {
  if (groups.length === 0) return -1;
  const preferredIdx = groups.findIndex((group) => {
    const lower = group.name.toLowerCase();
    return IDLE_CLIP_HINTS.some((hint) => lower.includes(hint));
  });
  return Math.max(preferredIdx, 0);
}

export function activateAnimationGroup(
  groups: readonly AnimationGroup[],
  activeIndex: number,
  nextIndex: number,
): number {
  const next = groups[nextIndex];
  if (!next || nextIndex === activeIndex) return activeIndex;
  for (const group of groups) {
    if (group !== next) {
      group.stop();
    }
  }
  next.reset();
  next.start(true);
  return nextIndex;
}

export function syncAnimationGroupsMotion(
  groups: readonly AnimationGroup[],
  activeClipIndex: number,
  reducedMotion: boolean,
): void {
  const activeGroup = activeClipIndex >= 0 ? groups[activeClipIndex] : undefined;
  for (const group of groups) {
    if (reducedMotion && group.isPlaying) {
      group.pause();
    } else if (!reducedMotion && group === activeGroup && !group.isPlaying) {
      group.play(true);
    }
  }
}

export function applyProceduralIdleMotion(
  rig: ProceduralRig,
  elapsedSec: number,
  energy: number,
  reducedMotion: boolean,
): void {
  if (reducedMotion) {
    rig.target.scaling.setAll(rig.baseScale);
    rig.target.position.y = rig.baseY;
    rig.target.rotation.set(0, 0, 0);
    return;
  }
  const breath = Math.sin(elapsedSec * 2.6);
  const scaleY = rig.baseScale * (1 + breath * 0.032 + energy * 0.065);
  const scaleXz = rig.baseScale * (1 - breath * 0.015);
  rig.target.scaling.set(scaleXz, scaleY, scaleXz);
  rig.target.rotation.z = Math.sin(elapsedSec * 1.55) * 0.045;
  rig.target.rotation.x = Math.sin(elapsedSec * 2.1) * 0.03;
  rig.target.position.y = rig.baseY + Math.abs(Math.sin(elapsedSec * 2.1)) * 0.04 + energy * 0.07;
}

function measureHierarchyBounds(root: TransformNode) {
  root.computeWorldMatrix(true);
  for (const child of root.getChildTransformNodes(false)) {
    child.computeWorldMatrix(true);
  }
  const { min, max } = root.getHierarchyBoundingVectors(true);
  const valid =
    Number.isFinite(min.x) &&
    Number.isFinite(max.x) &&
    max.x >= min.x &&
    max.y >= min.y &&
    max.z >= min.z;
  return { valid, min, max };
}

export function fitLoadedGlbModel(root: TransformNode): {
  readonly baseScale: number;
  readonly baseY: number;
} {
  const { valid, min, max } = measureHierarchyBounds(root);
  if (!valid) return { baseScale: 1, baseY: -0.58 };
  const size = max.subtract(min);
  const center = min.add(max).scale(0.5);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  if (maxDim <= 0.002) return { baseScale: 1, baseY: -0.58 };
  const scale = 1.52 / maxDim;
  const baseY = -0.54 - min.y * scale;
  root.scaling.setAll(scale);
  root.position.set(-center.x * scale, baseY, -center.z * scale);
  return { baseScale: scale, baseY };
}

export function hasRenderableGeometry(root: TransformNode): boolean {
  const { valid, min, max } = measureHierarchyBounds(root);
  if (!valid) return false;
  const size = max.subtract(min);
  return Vector3.Dot(size, size) > 0.0001;
}

function wrapContainerRootNodes(container: AssetContainer, scene: Scene): TransformNode {
  const wrapper = new TransformNode('glb-model-root', scene);
  for (const rootNode of container.rootNodes) {
    rootNode.parent = wrapper;
  }
  return wrapper;
}

export async function fetchFirstValidGlb(params: {
  readonly candidates: readonly string[];
  readonly index: number;
  readonly signal: AbortSignal;
  readonly scene: Scene;
  readonly isStale: () => boolean;
}): Promise<LoadedGlbPayload | null> {
  const { candidates, index, signal, scene, isStale } = params;
  const url = candidates[index];
  if (!url || isStale() || signal.aborted) return null;

  try {
    ensureSelfHostedDraco();
    const response = await fetch(url, { signal, mode: 'cors' });
    if (!response.ok || isStale()) {
      return fetchFirstValidGlb({ ...params, index: index + 1 });
    }
    const buffer = await response.arrayBuffer();
    if (isStale()) return null;

    const container = await LoadAssetContainerAsync(new Uint8Array(buffer), scene, {
      pluginExtension: '.glb',
    });
    if (isStale()) {
      container.dispose();
      return null;
    }

    const root = wrapContainerRootNodes(container, scene);
    if (!hasRenderableGeometry(root)) {
      root.dispose();
      container.dispose();
      return isStale() ? null : fetchFirstValidGlb({ ...params, index: index + 1 });
    }
    return { url, container, root };
  } catch {
    if (isStale() || signal.aborted) return null;
    return fetchFirstValidGlb({ ...params, index: index + 1 });
  }
}
