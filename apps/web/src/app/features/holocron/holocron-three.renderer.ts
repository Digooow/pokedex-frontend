import { type Color, type PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import type { HardwareTier } from '@pokeverse/shared';
import type { HolocronMediaState } from './holocron-animation.util';
import { createHologramMediaLoader } from './holocron-media-loader.util';
import {
  type StageOrbitState,
  advanceStageFpsWatchdog,
  applyCameraOrbit,
  bindStageCanvasListeners,
  createStageOrbitState,
  startStageRafLoop,
} from './holocron-orbit.util';
import { type HolocronTexturePair, resolveHolocronPalette } from './holocron-palette.util';
import {
  buildStageObjects,
  createRendererAndCamera,
  disposeObjectSubtree,
  disposeThreeScene,
} from './holocron-three-scene.util';

export interface HolocronSceneOptions {
  readonly canvas: HTMLCanvasElement;
  readonly tier: HardwareTier;
  readonly reducedMotion: boolean;
  readonly autoRotate: boolean;
  readonly textures: HolocronTexturePair;
  readonly glbCandidates: readonly string[];
  readonly types: readonly string[];
  readonly readEnergy: (elapsedMs: number) => number;
  readonly onMediaStateChange?: (media: HolocronMediaState) => void;
  readonly onContextLost: () => void;
  readonly onLowFps: () => void;
}

export interface HolocronSceneController {
  readonly updatePokemon: (
    textures: HolocronTexturePair,
    glbCandidates: readonly string[],
    types: readonly string[],
  ) => void;
  readonly selectAnimation: (index: number) => void;
  readonly setAutoRotate: (enabled: boolean) => void;
  readonly setReducedMotion: (reduced: boolean) => void;
  readonly nudgeOrbit: (deltaRad: number) => void;
  readonly resetCamera: () => void;
  readonly resize: () => void;
  readonly dispose: () => void;
}

function createFrameRenderer(
  options: HolocronSceneOptions,
  scene: Scene,
  camera: PerspectiveCamera,
  renderer: WebGLRenderer,
  stage: ReturnType<typeof buildStageObjects>,
  mediaLoader: ReturnType<typeof createHologramMediaLoader>,
  state: StageOrbitState,
) {
  return (now: number) => {
    if (state.disposed) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - state.lastFrameMs) / 1000));
    state.lastFrameMs = now;
    const energy = options.readEnergy(now);
    const uTime = stage.beamMat.uniforms['uTime'];
    const uEnergy = stage.beamMat.uniforms['uEnergy'];
    if (uTime) uTime.value = now * 0.001;
    if (uEnergy) uEnergy.value = energy;
    if (!state.reducedMotion && state.autoRotate && !state.dragging) state.orbitAngle += dt * 0.72;
    mediaLoader.tick(dt, now * 0.001, energy, state.reducedMotion);
    const bob = state.reducedMotion ? 0 : Math.sin(now * 0.0022) * 0.05 + energy * 0.08;
    stage.prism.hologramGroup.position.y = mediaLoader.hasLoadedGlb() ? 0 : 0.34 + bob;
    if (stage.particles && !state.reducedMotion) {
      stage.particles.points.rotation.y = state.orbitAngle * 0.65;
    }
    applyCameraOrbit(camera, state, 0.14);
    renderer.render(scene, camera);
    advanceStageFpsWatchdog(state, now, options.onLowFps);
  };
}

function buildSceneController(params: {
  readonly scene: Scene;
  readonly renderer: WebGLRenderer;
  readonly stage: ReturnType<typeof buildStageObjects>;
  readonly state: StageOrbitState;
  readonly mediaLoader: ReturnType<typeof createHologramMediaLoader>;
  readonly renderFrame: (now: number) => void;
  readonly cleanupListeners: () => void;
  readonly resize: () => void;
}): HolocronSceneController {
  const { scene, renderer, stage, state, mediaLoader, renderFrame, cleanupListeners, resize } =
    params;
  return {
    updatePokemon(textures, glbCandidates, types) {
      const next = resolveHolocronPalette(types);
      stage.pedestal.ringMat.color.setHex(next.primary);
      stage.pedestal.innerMat.color.setHex(next.accent);
      stage.prism.coreMat.color.setHex(next.primary);
      stage.rimLight.color.setHex(next.primary);
      const uColor = stage.beamMat.uniforms['uColor'];
      if (uColor) (uColor.value as Color).setHex(next.primary);
      stage.particles?.material.color.setHex(next.secondary);
      mediaLoader.load(textures, glbCandidates);
    },
    selectAnimation: (index) => mediaLoader.selectAnimation(index),
    setAutoRotate: (enabled) => {
      state.autoRotate = enabled;
    },
    setReducedMotion: (reduced) => {
      state.reducedMotion = reduced;
    },
    nudgeOrbit: (deltaRad) => {
      state.orbitAngle += deltaRad;
      renderFrame(performance.now());
    },
    resetCamera: () => {
      state.orbitAngle = 0;
      state.orbitPitch = 0.16;
      state.cameraRadius = 3.65;
      renderFrame(performance.now());
    },
    resize,
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      if (state.rafId !== null) cancelAnimationFrame(state.rafId);
      cleanupListeners();
      mediaLoader.disposeCurrent();
      disposeThreeScene(scene, renderer);
    },
  };
}

export function mountHolocronThreeScene(options: HolocronSceneOptions): HolocronSceneController {
  const { canvas } = options;
  const scene = new Scene();
  const { camera, renderer } = createRendererAndCamera(canvas, options.tier);
  const stage = buildStageObjects(scene, options.types, options.tier, options.reducedMotion);
  const state = createStageOrbitState({
    autoRotate: options.autoRotate,
    reducedMotion: options.reducedMotion,
  });
  const mediaLoader = createHologramMediaLoader(
    stage.prism,
    () => state.disposed,
    disposeObjectSubtree,
    options.onMediaStateChange,
  );
  mediaLoader.load(options.textures, options.glbCandidates);

  const resize = () => {
    const parent = canvas.parentElement;
    const width = Math.max(220, parent?.clientWidth ?? canvas.clientWidth ?? 320);
    const height = Math.max(200, parent?.clientHeight ?? canvas.clientHeight ?? 260);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();

  const renderFrame = createFrameRenderer(
    options,
    scene,
    camera,
    renderer,
    stage,
    mediaLoader,
    state,
  );
  const startLoop = startStageRafLoop({ state, renderFrame });
  const cleanupListeners = bindStageCanvasListeners({
    canvas,
    state,
    minRadius: 2.2,
    maxRadius: 5.2,
    onVisibilityResume: startLoop,
    onContextLost: options.onContextLost,
    onResize: resize,
  });
  startLoop();

  return buildSceneController({
    scene,
    renderer,
    stage,
    state,
    mediaLoader,
    renderFrame,
    cleanupListeners,
    resize,
  });
}
