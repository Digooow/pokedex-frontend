import {
  type AnimationAction,
  type AnimationClip,
  AnimationMixer,
  type Group,
  type MeshBasicMaterial,
  type Object3D,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  type HolocronMediaState,
  type LoadedGlbPayload,
  type ProceduralRig,
  applyProceduralIdleMotion,
  createLazyGlbLoader,
  fetchFirstValidGlb,
  fitLoadedGlbModel,
  formatAnimationClipLabel,
  pickDefaultClipIndex,
} from './holocron-animation.util';
import type { HolocronTexturePair } from './holocron-palette.util';

export interface HologramPrismRig {
  readonly hologramGroup: Group;
  readonly prismGroup: Group;
  readonly modelAnchor: Group;
  readonly frontMat: MeshBasicMaterial;
  readonly backMat: MeshBasicMaterial;
  readonly coreMat: MeshBasicMaterial;
}

interface MediaLoaderState {
  activeFront: Texture | null;
  activeBack: Texture | null;
  activeGlbUrl: string | null;
  requestEpoch: number;
  abortController: AbortController | null;
  mixer: AnimationMixer | null;
  actions: AnimationAction[];
  activeClipIndex: number;
  proceduralRig: ProceduralRig | null;
}

function createInitialLoaderState(): MediaLoaderState {
  return {
    activeFront: null,
    activeBack: null,
    activeGlbUrl: null,
    requestEpoch: 0,
    abortController: null,
    mixer: null,
    actions: [],
    activeClipIndex: -1,
    proceduralRig: null,
  };
}

function loadTextureAsync(
  texLoader: TextureLoader,
  url: string,
  onLoaded: (tex: Texture) => void,
): void {
  texLoader.load(
    url,
    (tex) => {
      tex.colorSpace = SRGBColorSpace;
      onLoaded(tex);
    },
    undefined,
    () => undefined,
  );
}

function resetAnimationState(state: MediaLoaderState): void {
  state.mixer?.stopAllAction();
  state.mixer = null;
  state.actions = [];
  state.activeClipIndex = -1;
  state.proceduralRig = null;
}

function clearAnchorChildren(
  prism: HologramPrismRig,
  state: MediaLoaderState,
  onDispose: (obj: Object3D) => void,
): void {
  resetAnimationState(state);
  for (let i = prism.modelAnchor.children.length - 1; i >= 0; i -= 1) {
    const child = prism.modelAnchor.children[i];
    if (child) {
      onDispose(child);
      prism.modelAnchor.remove(child);
    }
  }
  prism.prismGroup.visible = true;
}

function applyTexturesForEpoch(params: {
  readonly texLoader: TextureLoader;
  readonly prism: HologramPrismRig;
  readonly state: MediaLoaderState;
  readonly textures: HolocronTexturePair;
  readonly isStale: () => boolean;
}): void {
  const { texLoader, prism, state, textures, isStale } = params;
  if (textures.frontUrl) {
    loadTextureAsync(texLoader, textures.frontUrl, (tex) => {
      if (isStale()) return tex.dispose();
      state.activeFront?.dispose();
      state.activeFront = tex;
      prism.frontMat.map = tex;
      prism.frontMat.needsUpdate = true;
      if (!textures.backUrl) {
        state.activeBack?.dispose();
        state.activeBack = null;
        prism.backMat.map = tex;
        prism.backMat.color.setHex(0x93c5fd);
        prism.backMat.needsUpdate = true;
      }
    });
  }
  if (textures.backUrl) {
    loadTextureAsync(texLoader, textures.backUrl, (tex) => {
      if (isStale()) return tex.dispose();
      state.activeBack?.dispose();
      state.activeBack = tex;
      prism.backMat.map = tex;
      prism.backMat.color.setHex(0xffffff);
      prism.backMat.needsUpdate = true;
    });
  }
}

function attachLoadedModelToStage(params: {
  readonly prism: HologramPrismRig;
  readonly state: MediaLoaderState;
  readonly payload: LoadedGlbPayload;
  readonly onMediaState?: (media: HolocronMediaState) => void;
}): void {
  const { prism, state, payload, onMediaState } = params;
  const { scene, animations } = payload.gltf;
  const { baseScale, baseY } = fitLoadedGlbModel(scene);
  prism.modelAnchor.add(scene);
  prism.prismGroup.visible = false;
  state.activeGlbUrl = payload.url;

  if (animations.length > 0) {
    const mixer = new AnimationMixer(scene);
    const actions = animations.map((clip: AnimationClip) => mixer.clipAction(clip));
    const defaultIndex = pickDefaultClipIndex(animations);
    actions[defaultIndex]?.play();
    state.mixer = mixer;
    state.actions = actions;
    state.activeClipIndex = defaultIndex;
    onMediaState?.({
      kind: 'glb-animated',
      animations: animations.map((clip, idx) => ({
        index: idx,
        label: formatAnimationClipLabel(clip.name, idx),
      })),
      activeAnimationIndex: defaultIndex,
    });
    return;
  }

  state.proceduralRig = { target: scene, baseScale, baseY };
  onMediaState?.({ kind: 'glb-procedural', animations: [], activeAnimationIndex: -1 });
}

async function syncGlbForEpoch(params: {
  readonly prism: HologramPrismRig;
  readonly state: MediaLoaderState;
  readonly glbCandidates: readonly string[];
  readonly signal: AbortSignal;
  readonly isStale: () => boolean;
  readonly getLoader: () => Promise<GLTFLoader>;
  readonly onDisposeSubtree: (obj: Object3D) => void;
  readonly onMediaState?: (media: HolocronMediaState) => void;
}): Promise<void> {
  const {
    prism,
    state,
    glbCandidates,
    signal,
    isStale,
    getLoader,
    onDisposeSubtree,
    onMediaState,
  } = params;
  if (glbCandidates.length === 0) {
    clearAnchorChildren(prism, state, onDisposeSubtree);
    state.activeGlbUrl = null;
    onMediaState?.({ kind: 'prism-2d', animations: [], activeAnimationIndex: -1 });
    return;
  }
  clearAnchorChildren(prism, state, onDisposeSubtree);
  state.activeGlbUrl = null;
  onMediaState?.({ kind: 'loading', animations: [], activeAnimationIndex: -1 });

  const payload = await fetchFirstValidGlb({
    candidates: glbCandidates,
    index: 0,
    signal,
    isStale,
    getLoader,
    onDispose: onDisposeSubtree,
  });
  if (isStale()) return;
  if (!payload) {
    onMediaState?.({ kind: 'prism-2d', animations: [], activeAnimationIndex: -1 });
    return;
  }
  attachLoadedModelToStage({ prism, state, payload, onMediaState });
}

export function createHologramMediaLoader(
  prism: HologramPrismRig,
  isDisposed: () => boolean,
  onDisposeSubtree: (obj: Object3D) => void,
  onMediaState?: (media: HolocronMediaState) => void,
) {
  const texLoader = new TextureLoader();
  texLoader.setCrossOrigin('anonymous');
  const glbLoader = createLazyGlbLoader();
  const state = createInitialLoaderState();

  return {
    load(textures: HolocronTexturePair, glbCandidates: readonly string[]) {
      if (isDisposed()) return;
      state.abortController?.abort();
      const controller = new AbortController();
      state.abortController = controller;
      const epoch = ++state.requestEpoch;
      const isStale = () => isDisposed() || epoch !== state.requestEpoch;
      applyTexturesForEpoch({ texLoader, prism, state, textures, isStale });
      void syncGlbForEpoch({
        prism,
        state,
        glbCandidates,
        signal: controller.signal,
        isStale,
        getLoader: () => glbLoader.getLoader(),
        onDisposeSubtree,
        onMediaState,
      });
    },
    selectAnimation(index: number) {
      const next = state.actions[index];
      if (!next || index === state.activeClipIndex) return;
      const current = state.actions[state.activeClipIndex];
      next.reset().play();
      if (current) current.crossFadeTo(next, 0.25, false);
      state.activeClipIndex = index;
    },
    tick(dt: number, elapsedSec: number, energy: number, reducedMotion: boolean) {
      if (state.mixer && !reducedMotion) state.mixer.update(dt);
      if (state.proceduralRig) {
        applyProceduralIdleMotion(state.proceduralRig, elapsedSec, energy, reducedMotion);
      }
    },
    hasLoadedGlb: () => state.activeGlbUrl !== null,
    disposeCurrent() {
      state.requestEpoch += 1;
      state.abortController?.abort();
      state.abortController = null;
      state.activeFront?.dispose();
      state.activeBack?.dispose();
      state.activeFront = null;
      state.activeBack = null;
      clearAnchorChildren(prism, state, onDisposeSubtree);
      state.activeGlbUrl = null;
      glbLoader.dispose();
    },
  };
}
