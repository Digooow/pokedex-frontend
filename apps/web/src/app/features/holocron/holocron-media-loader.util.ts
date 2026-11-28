import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { Constants } from '@babylonjs/core/Engines/constants';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { color3FromHexInt } from '../../core/engine-ports/babylon-stage.util';
import {
  type HolocronMediaState,
  type LoadedGlbPayload,
  type ProceduralRig,
  activateAnimationGroup,
  applyProceduralIdleMotion,
  fetchFirstValidGlb,
  fitLoadedGlbModel,
  formatAnimationClipLabel,
  pickDefaultClipIndex,
  syncAnimationGroupsMotion,
} from './holocron-animation.util';
import type { HolocronPalette, HolocronTexturePair } from './holocron-palette.util';

export interface HologramPrismRig {
  readonly hologramGroup: TransformNode;
  readonly prismGroup: TransformNode;
  readonly modelAnchor: TransformNode;
  readonly frontMat: StandardMaterial;
  readonly backMat: StandardMaterial;
  readonly coreMat: StandardMaterial;
}

interface MediaLoaderState {
  activeFront: Texture | null;
  activeBack: Texture | null;
  activeGlbUrl: string | null;
  activeContainer: AssetContainer | null;
  activeRoot: TransformNode | null;
  requestEpoch: number;
  abortController: AbortController | null;
  animationGroups: AnimationGroup[];
  activeClipIndex: number;
  proceduralRig: ProceduralRig | null;
}

function createInitialLoaderState(): MediaLoaderState {
  return {
    activeFront: null,
    activeBack: null,
    activeGlbUrl: null,
    activeContainer: null,
    activeRoot: null,
    requestEpoch: 0,
    abortController: null,
    animationGroups: [],
    activeClipIndex: -1,
    proceduralRig: null,
  };
}

export function createHologramPrism(scene: Scene, palette: HolocronPalette): HologramPrismRig {
  const hologramGroup = new TransformNode('holocron-group', scene);
  hologramGroup.position.y = 0.34;

  const prismGroup = new TransformNode('holocron-prism', scene);
  prismGroup.parent = hologramGroup;

  const frontMat = new StandardMaterial('holo-prism-front', scene);
  frontMat.disableLighting = true;
  frontMat.emissiveColor = Color3.White();
  frontMat.alpha = 0.96;
  frontMat.backFaceCulling = true;
  frontMat.disableDepthWrite = true;

  const backMat = new StandardMaterial('holo-prism-back', scene);
  backMat.disableLighting = true;
  backMat.emissiveColor = color3FromHexInt(0x93c5fd);
  backMat.alpha = 0.92;
  backMat.backFaceCulling = true;
  backMat.disableDepthWrite = true;

  const frontMesh = CreatePlane('holo-front-plane', { size: 1.65 }, scene);
  frontMesh.position.z = 0.04;
  frontMesh.rotation.y = Math.PI;
  frontMesh.material = frontMat;
  frontMesh.parent = prismGroup;

  const backMesh = CreatePlane('holo-back-plane', { size: 1.65 }, scene);
  backMesh.position.z = -0.04;
  backMesh.material = backMat;
  backMesh.parent = prismGroup;

  const coreMat = new StandardMaterial('holo-prism-core', scene);
  coreMat.disableLighting = true;
  coreMat.emissiveColor = color3FromHexInt(palette.primary);
  coreMat.alpha = 0.16;
  coreMat.alphaMode = Constants.ALPHA_ADD;
  coreMat.disableDepthWrite = true;

  const coreMesh = CreateBox('holo-core-box', { width: 1.56, height: 1.56, depth: 0.06 }, scene);
  coreMesh.material = coreMat;
  coreMesh.parent = prismGroup;

  const modelAnchor = new TransformNode('holo-model-anchor', scene);
  modelAnchor.parent = hologramGroup;

  return { hologramGroup, prismGroup, modelAnchor, frontMat, backMat, coreMat };
}

function loadTextureAsync(
  scene: Scene,
  url: string,
  isStale: () => boolean,
  onLoaded: (tex: Texture) => void,
): void {
  const tex = new Texture(
    url,
    scene,
    false,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
    () => {
      if (isStale()) {
        tex.dispose();
        return;
      }
      tex.hasAlpha = true;
      onLoaded(tex);
    },
    () => tex.dispose(),
  );
}

function clearActiveGlb(prism: HologramPrismRig, state: MediaLoaderState): void {
  for (const group of state.animationGroups) {
    group.stop();
  }
  state.animationGroups = [];
  state.activeClipIndex = -1;
  state.proceduralRig = null;
  state.activeRoot?.dispose();
  state.activeContainer?.dispose();
  state.activeRoot = null;
  state.activeContainer = null;
  prism.prismGroup.setEnabled(true);
}

function applyTexturesForEpoch(params: {
  readonly scene: Scene;
  readonly prism: HologramPrismRig;
  readonly state: MediaLoaderState;
  readonly textures: HolocronTexturePair;
  readonly isStale: () => boolean;
}): void {
  const { scene, prism, state, textures, isStale } = params;
  if (textures.frontUrl) {
    loadTextureAsync(scene, textures.frontUrl, isStale, (tex) => {
      state.activeFront?.dispose();
      state.activeFront = tex;
      prism.frontMat.emissiveTexture = tex;
      prism.frontMat.opacityTexture = tex;
      if (!textures.backUrl) {
        state.activeBack?.dispose();
        state.activeBack = null;
        prism.backMat.emissiveTexture = tex;
        prism.backMat.opacityTexture = tex;
        prism.backMat.emissiveColor = color3FromHexInt(0x93c5fd);
      }
    });
  }
  if (textures.backUrl) {
    loadTextureAsync(scene, textures.backUrl, isStale, (tex) => {
      state.activeBack?.dispose();
      state.activeBack = tex;
      prism.backMat.emissiveTexture = tex;
      prism.backMat.opacityTexture = tex;
      prism.backMat.emissiveColor = Color3.White();
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
  const { container, root } = payload;
  container.addAllToScene();
  root.parent = prism.modelAnchor;
  const { baseScale, baseY } = fitLoadedGlbModel(root);
  prism.prismGroup.setEnabled(false);
  state.activeContainer = container;
  state.activeRoot = root;
  state.activeGlbUrl = payload.url;

  const groups = container.animationGroups;
  if (groups.length > 0) {
    const defaultIndex = pickDefaultClipIndex(groups);
    state.animationGroups = groups;
    state.activeClipIndex = activateAnimationGroup(groups, -1, defaultIndex);
    onMediaState?.({
      kind: 'glb-animated',
      animations: groups.map((clip, idx) => ({
        index: idx,
        label: formatAnimationClipLabel(clip.name, idx),
      })),
      activeAnimationIndex: defaultIndex,
    });
    return;
  }

  state.proceduralRig = { target: root, baseScale, baseY };
  onMediaState?.({ kind: 'glb-procedural', animations: [], activeAnimationIndex: -1 });
}

async function syncGlbForEpoch(params: {
  readonly scene: Scene;
  readonly prism: HologramPrismRig;
  readonly state: MediaLoaderState;
  readonly glbCandidates: readonly string[];
  readonly signal: AbortSignal;
  readonly isStale: () => boolean;
  readonly onMediaState?: (media: HolocronMediaState) => void;
}): Promise<void> {
  const { scene, prism, state, glbCandidates, signal, isStale, onMediaState } = params;
  clearActiveGlb(prism, state);
  state.activeGlbUrl = null;
  if (glbCandidates.length === 0) {
    onMediaState?.({ kind: 'prism-2d', animations: [], activeAnimationIndex: -1 });
    return;
  }
  onMediaState?.({ kind: 'loading', animations: [], activeAnimationIndex: -1 });

  const payload = await fetchFirstValidGlb({
    candidates: glbCandidates,
    index: 0,
    signal,
    scene,
    isStale,
  });
  if (isStale()) return;
  if (!payload) {
    onMediaState?.({ kind: 'prism-2d', animations: [], activeAnimationIndex: -1 });
    return;
  }
  attachLoadedModelToStage({ prism, state, payload, onMediaState });
}

export function createHologramMediaLoader(
  scene: Scene,
  prism: HologramPrismRig,
  isDisposed: () => boolean,
  onMediaState?: (media: HolocronMediaState) => void,
) {
  const state = createInitialLoaderState();

  return {
    load(textures: HolocronTexturePair, glbCandidates: readonly string[]) {
      if (isDisposed()) return;
      state.abortController?.abort();
      const controller = new AbortController();
      state.abortController = controller;
      const epoch = ++state.requestEpoch;
      const isStale = () => isDisposed() || epoch !== state.requestEpoch;
      applyTexturesForEpoch({ scene, prism, state, textures, isStale });
      void syncGlbForEpoch({
        scene,
        prism,
        state,
        glbCandidates,
        signal: controller.signal,
        isStale,
        onMediaState,
      });
    },
    selectAnimation(index: number) {
      state.activeClipIndex = activateAnimationGroup(
        state.animationGroups,
        state.activeClipIndex,
        index,
      );
    },
    tick(elapsedSec: number, energy: number, reducedMotion: boolean) {
      syncAnimationGroupsMotion(state.animationGroups, state.activeClipIndex, reducedMotion);
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
      clearActiveGlb(prism, state);
      state.activeGlbUrl = null;
    },
  };
}
