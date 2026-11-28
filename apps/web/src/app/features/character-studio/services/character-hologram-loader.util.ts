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

export interface CharacterStageRuntime {
  readonly modelAnchor: Group;
  readonly loader: ReturnType<typeof createLazyGlbLoader>;
  requestEpoch: number;
  abortController: AbortController | null;
  mixer: AnimationMixer | null;
  actions: ReturnType<AnimationMixer['clipAction']>[];
  activeClipIndex: number;
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
  };
}

export function clearCharacterAnchor(runtime: CharacterStageRuntime): void {
  runtime.mixer?.stopAllAction();
  runtime.mixer = null;
  runtime.actions = [];
  runtime.activeClipIndex = -1;
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

function attachCharacterModel(params: {
  readonly runtime: CharacterStageRuntime;
  readonly sceneRoot: Object3D;
  readonly animations: readonly AnimationClip[];
  readonly onMediaState?: (media: CharacterHologramMediaState) => void;
}): void {
  const { runtime, sceneRoot, animations, onMediaState } = params;
  const boxFit = fitLoadedGlbModel(sceneRoot);
  sceneRoot.position.y = boxFit.baseY - 0.1;
  runtime.modelAnchor.add(sceneRoot);
  if (animations.length === 0) {
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
