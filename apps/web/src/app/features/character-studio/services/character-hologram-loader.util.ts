import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { Axis } from '@babylonjs/core/Maths/math.axis';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { type CharacterBodyModel, getCharacterBodyModelMeta } from '@pokeverse/shared';
import type { CharacterHologramMediaState } from '../../../core/engine-ports/avatar-stage.port';
import {
  activateAnimationGroup,
  fetchFirstValidGlb,
  fitLoadedGlbModel,
  formatAnimationClipLabel,
  pickDefaultClipIndex,
} from '../../holocron/holocron-animation.util';

export interface ProceduralCharacterPose {
  readonly chest: TransformNode | null;
  readonly head: TransformNode | null;
  readonly upperArmL: TransformNode | null;
  readonly upperArmR: TransformNode | null;
  readonly chestBaseQuat: Quaternion | null;
  readonly headBaseQuat: Quaternion | null;
  readonly armLBaseQuat: Quaternion | null;
  readonly armRBaseQuat: Quaternion | null;
}

export interface CharacterStageRuntime {
  readonly scene: Scene;
  readonly modelAnchor: TransformNode;
  requestEpoch: number;
  abortController: AbortController | null;
  activeContainer: AssetContainer | null;
  activeRoot: TransformNode | null;
  animationGroups: AnimationGroup[];
  activeClipIndex: number;
  proceduralPose: ProceduralCharacterPose | null;
}

export function createCharacterStageRuntime(
  scene: Scene,
  modelAnchor: TransformNode,
): CharacterStageRuntime {
  return {
    scene,
    modelAnchor,
    requestEpoch: 0,
    abortController: null,
    activeContainer: null,
    activeRoot: null,
    animationGroups: [],
    activeClipIndex: -1,
    proceduralPose: null,
  };
}

export function clearCharacterAnchor(runtime: CharacterStageRuntime): void {
  for (const group of runtime.animationGroups) {
    group.stop();
  }
  runtime.animationGroups = [];
  runtime.activeClipIndex = -1;
  runtime.proceduralPose = null;
  runtime.activeRoot?.dispose();
  runtime.activeContainer?.dispose();
  runtime.activeRoot = null;
  runtime.activeContainer = null;
}

export function selectRuntimeAnimation(runtime: CharacterStageRuntime, index: number): void {
  runtime.activeClipIndex = activateAnimationGroup(
    runtime.animationGroups,
    runtime.activeClipIndex,
    index,
  );
}

function findBone(nodes: readonly TransformNode[], name: string): TransformNode | null {
  const sanitizedTarget = name.replaceAll('.', '');
  return (
    nodes.find((node) => node.name === name || node.name.replaceAll('.', '') === sanitizedTarget) ??
    null
  );
}

function snapshotAndRotateLocal(
  node: TransformNode | null,
  axis: Vector3,
  angleRad: number,
): Quaternion | null {
  if (!node) return null;
  const base = node.rotationQuaternion
    ? node.rotationQuaternion.clone()
    : Quaternion.FromEulerVector(node.rotation);
  const delta = Quaternion.RotationAxis(axis, angleRad);
  const next = base.multiply(delta);
  node.rotationQuaternion = next.clone();
  return next;
}

function applyAxisOffset(
  node: TransformNode | null,
  baseQuat: Quaternion | null,
  angleX: number,
): void {
  if (!node || !baseQuat) return;
  if (angleX === 0) {
    node.rotationQuaternion = baseQuat.clone();
    return;
  }
  const delta = Quaternion.RotationAxis(Axis.X, angleX);
  node.rotationQuaternion = baseQuat.multiply(delta);
}

function applyRelaxedHeroicPose(nodes: readonly TransformNode[]): ProceduralCharacterPose {
  const upperArmL = findBone(nodes, 'UpperArmL');
  const upperArmR = findBone(nodes, 'UpperArmR');
  const lowerArmL = findBone(nodes, 'LowerArmL');
  const lowerArmR = findBone(nodes, 'LowerArmR');
  const chest = findBone(nodes, 'Chest');
  const head = findBone(nodes, 'Head');

  const armLBaseQuat = snapshotAndRotateLocal(upperArmL, Axis.X, -1.22);
  const armRBaseQuat = snapshotAndRotateLocal(upperArmR, Axis.X, -1.22);
  snapshotAndRotateLocal(lowerArmL, Axis.Z, -0.22);
  snapshotAndRotateLocal(lowerArmR, Axis.Z, 0.22);

  return {
    chest,
    head,
    upperArmL,
    upperArmR,
    chestBaseQuat: snapshotAndRotateLocal(chest, Axis.X, 0),
    headBaseQuat: snapshotAndRotateLocal(head, Axis.X, 0),
    armLBaseQuat,
    armRBaseQuat,
  };
}

export function tickCharacterProceduralIdle(
  pose: ProceduralCharacterPose | null,
  elapsedSec: number,
  reducedMotion: boolean,
): void {
  if (!pose) return;
  if (reducedMotion) {
    applyAxisOffset(pose.chest, pose.chestBaseQuat, 0);
    applyAxisOffset(pose.head, pose.headBaseQuat, 0);
    applyAxisOffset(pose.upperArmL, pose.armLBaseQuat, 0);
    applyAxisOffset(pose.upperArmR, pose.armRBaseQuat, 0);
    return;
  }
  const breath = Math.sin(elapsedSec * 2.1);
  applyAxisOffset(pose.chest, pose.chestBaseQuat, breath * 0.025);
  applyAxisOffset(pose.head, pose.headBaseQuat, -breath * 0.018);
  applyAxisOffset(pose.upperArmL, pose.armLBaseQuat, breath * 0.03);
  applyAxisOffset(pose.upperArmR, pose.armRBaseQuat, breath * 0.03);
}

function attachCharacterModel(params: {
  readonly runtime: CharacterStageRuntime;
  readonly container: AssetContainer;
  readonly root: TransformNode;
  readonly onMediaState?: (media: CharacterHologramMediaState) => void;
}): void {
  const { runtime, container, root, onMediaState } = params;
  container.addAllToScene();
  root.parent = runtime.modelAnchor;
  const boxFit = fitLoadedGlbModel(root);
  root.position.y = boxFit.baseY - 0.12;
  runtime.activeContainer = container;
  runtime.activeRoot = root;

  const groups = container.animationGroups;
  if (groups.length === 0) {
    runtime.proceduralPose = applyRelaxedHeroicPose(container.transformNodes);
    onMediaState?.({ kind: 'glb-procedural', animations: [], activeAnimationIndex: -1 });
    return;
  }

  const defaultIndex = pickDefaultClipIndex(groups);
  runtime.animationGroups = groups;
  runtime.activeClipIndex = activateAnimationGroup(groups, -1, defaultIndex);
  onMediaState?.({
    kind: 'glb-animated',
    animations: groups.map((clip, index) => ({
      index,
      label: formatAnimationClipLabel(clip.name, index),
    })),
    activeAnimationIndex: defaultIndex,
  });
}

export async function loadCharacterModelForBody(params: {
  readonly runtime: CharacterStageRuntime;
  readonly bodyModel: CharacterBodyModel;
  readonly isDisposed: () => boolean;
  readonly onMediaState?: (media: CharacterHologramMediaState) => void;
}): Promise<void> {
  const { runtime, bodyModel, isDisposed, onMediaState } = params;
  runtime.abortController?.abort();
  const controller = new AbortController();
  runtime.abortController = controller;
  const epoch = ++runtime.requestEpoch;
  const isStale = () => isDisposed() || epoch !== runtime.requestEpoch;
  clearCharacterAnchor(runtime);
  onMediaState?.({ kind: 'loading', animations: [], activeAnimationIndex: -1 });

  const payload = await fetchFirstValidGlb({
    candidates: [getCharacterBodyModelMeta(bodyModel).modelUrl],
    index: 0,
    signal: controller.signal,
    scene: runtime.scene,
    isStale,
  });
  if (isStale()) return;
  if (!payload) {
    onMediaState?.({ kind: 'fallback-2d', animations: [], activeAnimationIndex: -1 });
    return;
  }
  attachCharacterModel({
    runtime,
    container: payload.container,
    root: payload.root,
    onMediaState,
  });
}
