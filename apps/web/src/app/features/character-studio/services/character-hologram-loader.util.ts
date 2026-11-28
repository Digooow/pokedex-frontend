import { type CharacterBodyModel, getCharacterBodyModelMeta } from '@pokeverse/shared';
import { type AnimationClip, AnimationMixer, Group, type Object3D } from 'three';
import type { CharacterHologramMediaState } from '../../../core/engine-ports/avatar-stage.port';
import {
  createLazyGlbLoader,
  fetchFirstValidGlb,
  fitLoadedGlbModel,
  formatAnimationClipLabel,
  pickDefaultClipIndex,
} from '../../holocron/holocron-animation.util';
import { disposeObjectSubtree } from '../../holocron/holocron-three-scene.util';

export interface ProceduralCharacterPose {
  readonly chest: Object3D | null;
  readonly head: Object3D | null;
  readonly upperArmL: Object3D | null;
  readonly upperArmR: Object3D | null;
  readonly chestBaseX: number;
  readonly headBaseX: number;
  readonly armLBaseX: number;
  readonly armRBaseX: number;
}

export interface CharacterStageRuntime {
  readonly modelAnchor: Group;
  readonly loader: ReturnType<typeof createLazyGlbLoader>;
  requestEpoch: number;
  abortController: AbortController | null;
  mixer: AnimationMixer | null;
  actions: ReturnType<AnimationMixer['clipAction']>[];
  activeClipIndex: number;
  proceduralPose: ProceduralCharacterPose | null;
}

export function createCharacterStageRuntime(modelAnchor: Group): CharacterStageRuntime {
  return {
    modelAnchor,
    loader: createLazyGlbLoader(),
    requestEpoch: 0,
    abortController: null,
    mixer: null,
    actions: [],
    activeClipIndex: -1,
    proceduralPose: null,
  };
}

export function clearCharacterAnchor(runtime: CharacterStageRuntime): void {
  runtime.mixer?.stopAllAction();
  runtime.mixer = null;
  runtime.actions = [];
  runtime.activeClipIndex = -1;
  runtime.proceduralPose = null;
  for (let i = runtime.modelAnchor.children.length - 1; i >= 0; i -= 1) {
    const child = runtime.modelAnchor.children[i];
    if (child) {
      disposeObjectSubtree(child);
      runtime.modelAnchor.remove(child);
    }
  }
}

export function selectRuntimeAnimation(runtime: CharacterStageRuntime, index: number): void {
  const next = runtime.actions[index];
  if (!next || index === runtime.activeClipIndex) return;
  const current = runtime.actions[runtime.activeClipIndex];
  next.reset().play();
  if (current) current.crossFadeTo(next, 0.22, false);
  runtime.activeClipIndex = index;
}

function findBone(sceneRoot: Object3D, name: string): Object3D | null {
  return sceneRoot.getObjectByName(name) ?? null;
}

function applyRelaxedHeroicPose(sceneRoot: Object3D): ProceduralCharacterPose {
  const upperArmL = findBone(sceneRoot, 'UpperArmL');
  const upperArmR = findBone(sceneRoot, 'UpperArmR');
  const lowerArmL = findBone(sceneRoot, 'LowerArmL');
  const lowerArmR = findBone(sceneRoot, 'LowerArmR');
  const chest = findBone(sceneRoot, 'Chest');
  const head = findBone(sceneRoot, 'Head');

  upperArmL?.rotateX(-1.22);
  upperArmR?.rotateX(-1.22);
  lowerArmL?.rotateZ(-0.22);
  lowerArmR?.rotateZ(0.22);

  return {
    chest,
    head,
    upperArmL,
    upperArmR,
    chestBaseX: chest ? chest.rotation.x : 0,
    headBaseX: head ? head.rotation.x : 0,
    armLBaseX: upperArmL ? upperArmL.rotation.x : 0,
    armRBaseX: upperArmR ? upperArmR.rotation.x : 0,
  };
}

export function tickCharacterProceduralIdle(
  pose: ProceduralCharacterPose | null,
  elapsedSec: number,
  reducedMotion: boolean,
): void {
  if (!pose) return;
  if (reducedMotion) {
    if (pose.chest) pose.chest.rotation.x = pose.chestBaseX;
    if (pose.head) pose.head.rotation.x = pose.headBaseX;
    if (pose.upperArmL) pose.upperArmL.rotation.x = pose.armLBaseX;
    if (pose.upperArmR) pose.upperArmR.rotation.x = pose.armRBaseX;
    return;
  }
  const breath = Math.sin(elapsedSec * 2.1);
  if (pose.chest) pose.chest.rotation.x = pose.chestBaseX + breath * 0.025;
  if (pose.head) pose.head.rotation.x = pose.headBaseX - breath * 0.018;
  if (pose.upperArmL) pose.upperArmL.rotation.x = pose.armLBaseX + breath * 0.03;
  if (pose.upperArmR) pose.upperArmR.rotation.x = pose.armRBaseX + breath * 0.03;
}

function attachCharacterModel(params: {
  readonly runtime: CharacterStageRuntime;
  readonly sceneRoot: Object3D;
  readonly animations: readonly AnimationClip[];
  readonly onMediaState?: (media: CharacterHologramMediaState) => void;
}): void {
  const { runtime, sceneRoot, animations, onMediaState } = params;
  const boxFit = fitLoadedGlbModel(sceneRoot);
  sceneRoot.position.y = boxFit.baseY - 0.12;
  runtime.modelAnchor.add(sceneRoot);

  if (animations.length === 0) {
    runtime.proceduralPose = applyRelaxedHeroicPose(sceneRoot);
    onMediaState?.({ kind: 'glb-procedural', animations: [], activeAnimationIndex: -1 });
    return;
  }

  const mixer = new AnimationMixer(sceneRoot);
  const actions = animations.map((clip) => mixer.clipAction(clip));
  const defaultIndex = pickDefaultClipIndex(animations);
  actions[defaultIndex]?.play();
  runtime.mixer = mixer;
  runtime.actions = actions;
  runtime.activeClipIndex = defaultIndex;
  onMediaState?.({
    kind: 'glb-animated',
    animations: animations.map((clip, index) => ({
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
    isStale,
    getLoader: () => runtime.loader.getLoader(),
    onDispose: disposeObjectSubtree,
  });
  if (isStale()) return;
  if (!payload) {
    onMediaState?.({ kind: 'fallback-2d', animations: [], activeAnimationIndex: -1 });
    return;
  }
  attachCharacterModel({
    runtime,
    sceneRoot: payload.gltf.scene,
    animations: payload.gltf.animations,
    onMediaState,
  });
}
