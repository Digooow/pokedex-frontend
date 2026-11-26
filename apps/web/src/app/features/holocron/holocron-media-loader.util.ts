import {
  Box3,
  type Group,
  type MeshBasicMaterial,
  type Object3D,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector3,
} from 'three';
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
}

function fitLoadedGlbModel(model: Object3D): void {
  const box = new Box3().setFromObject(model);
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const scale = 1.55 / maxDim;
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
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

async function fetchGlbModel(
  glbUrl: string,
  isStale: () => boolean,
  onDispose: (obj: Object3D) => void,
): Promise<Object3D | null> {
  try {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    if (isStale()) return null;
    const gltf = await new GLTFLoader().loadAsync(glbUrl);
    if (isStale()) {
      onDispose(gltf.scene);
      return null;
    }
    fitLoadedGlbModel(gltf.scene);
    return gltf.scene;
  } catch {
    return null;
  }
}

function clearAnchorChildren(prism: HologramPrismRig, onDispose: (obj: Object3D) => void): void {
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

async function syncGlbForEpoch(params: {
  readonly prism: HologramPrismRig;
  readonly state: MediaLoaderState;
  readonly glbUrl: string | null;
  readonly isStale: () => boolean;
  readonly onDisposeSubtree: (obj: Object3D) => void;
}): Promise<void> {
  const { prism, state, glbUrl, isStale, onDisposeSubtree } = params;
  if (!glbUrl) {
    clearAnchorChildren(prism, onDisposeSubtree);
    state.activeGlbUrl = null;
    return;
  }
  if (glbUrl === state.activeGlbUrl && prism.modelAnchor.children.length > 0) return;
  clearAnchorChildren(prism, onDisposeSubtree);
  state.activeGlbUrl = null;
  const model = await fetchGlbModel(glbUrl, isStale, onDisposeSubtree);
  if (!model) return;
  prism.modelAnchor.add(model);
  prism.prismGroup.visible = false;
  state.activeGlbUrl = glbUrl;
}

export function createHologramMediaLoader(
  prism: HologramPrismRig,
  isDisposed: () => boolean,
  onDisposeSubtree: (obj: Object3D) => void,
) {
  const texLoader = new TextureLoader();
  texLoader.setCrossOrigin('anonymous');
  const state: MediaLoaderState = {
    activeFront: null,
    activeBack: null,
    activeGlbUrl: null,
    requestEpoch: 0,
  };

  return {
    load(textures: HolocronTexturePair, glbUrl: string | null) {
      if (isDisposed()) return;
      const epoch = ++state.requestEpoch;
      const isStale = () => isDisposed() || epoch !== state.requestEpoch;
      applyTexturesForEpoch({ texLoader, prism, state, textures, isStale });
      void syncGlbForEpoch({ prism, state, glbUrl, isStale, onDisposeSubtree });
    },
    disposeCurrent() {
      state.requestEpoch += 1;
      state.activeFront?.dispose();
      state.activeBack?.dispose();
      state.activeFront = null;
      state.activeBack = null;
      clearAnchorChildren(prism, onDisposeSubtree);
      state.activeGlbUrl = null;
    },
  };
}
