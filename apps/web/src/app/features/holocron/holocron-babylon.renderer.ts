import type { HardwareTier } from '@pokeverse/shared';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { Engine } from '@babylonjs/core/Engines/engine';
import type { Scene } from '@babylonjs/core/scene';
import {
  addBabylonStageLights,
  color3FromHexInt,
  createBabylonBeamCone,
  createBabylonParticleField,
  createBabylonPedestal,
  createBabylonStageAndCamera,
  disposeBabylonStage,
  resizeBabylonCanvas,
} from '../../core/engine-ports/babylon-stage.util';
import type { HolocronMediaState } from './holocron-animation.util';
import { createHologramMediaLoader, createHologramPrism } from './holocron-media-loader.util';
import {
  type StageOrbitState,
  advanceStageFpsWatchdog,
  applyCameraOrbit,
  bindStageCanvasListeners,
  createBaseOrbitControls,
  createStageOrbitState,
  startStageRafLoop,
} from './holocron-orbit.util';
import { type HolocronTexturePair, resolveHolocronPalette } from './holocron-palette.util';

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

function buildHolocronStageObjects(
  scene: Scene,
  types: readonly string[],
  tier: HardwareTier,
  reducedMotion: boolean,
) {
  const palette = resolveHolocronPalette(types);
  const rimLight = addBabylonStageLights(scene, palette.primary);
  const pedestal = createBabylonPedestal(scene, palette);
  const beamMat = createBabylonBeamCone(scene, palette);
  const prism = createHologramPrism(scene, palette);
  let particleCount = 0;
  if (!reducedMotion) {
    particleCount = tier === 'ultra' ? 140 : 64;
  }
  const particles =
    particleCount > 0 ? createBabylonParticleField(scene, palette, particleCount) : null;
  return { rimLight, pedestal, beamMat, prism, particles };
}

function createFrameRenderer(params: {
  readonly options: HolocronSceneOptions;
  readonly scene: Scene;
  readonly camera: FreeCamera;
  readonly stage: ReturnType<typeof buildHolocronStageObjects>;
  readonly mediaLoader: ReturnType<typeof createHologramMediaLoader>;
  readonly state: StageOrbitState;
}) {
  const { options, scene, camera, stage, mediaLoader, state } = params;
  return (now: number) => {
    if (state.disposed) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - state.lastFrameMs) / 1000));
    state.lastFrameMs = now;
    const energy = options.readEnergy(now);
    stage.beamMat.setFloat('uTime', now * 0.001);
    stage.beamMat.setFloat('uEnergy', energy);
    if (!state.reducedMotion && state.autoRotate && !state.dragging) state.orbitAngle += dt * 0.72;
    mediaLoader.tick(now * 0.001, energy, state.reducedMotion);
    const bob = state.reducedMotion ? 0 : Math.sin(now * 0.0022) * 0.05 + energy * 0.08;
    stage.prism.hologramGroup.position.y = mediaLoader.hasLoadedGlb() ? 0 : 0.34 + bob;
    if (stage.particles && !state.reducedMotion) {
      stage.particles.mesh.rotation.y = state.orbitAngle * 0.65;
    }
    applyCameraOrbit(camera, state, 0.14);
    scene.render();
    advanceStageFpsWatchdog(state, now, options.onLowFps);
  };
}

function buildSceneController(params: {
  readonly scene: Scene;
  readonly engine: Engine;
  readonly stage: ReturnType<typeof buildHolocronStageObjects>;
  readonly state: StageOrbitState;
  readonly mediaLoader: ReturnType<typeof createHologramMediaLoader>;
  readonly renderFrame: (now: number) => void;
  readonly cleanupListeners: () => void;
  readonly resize: () => void;
}): HolocronSceneController {
  const { scene, engine, stage, state, mediaLoader, renderFrame, cleanupListeners, resize } =
    params;
  return {
    updatePokemon(textures, glbCandidates, types) {
      const next = resolveHolocronPalette(types);
      const primary = color3FromHexInt(next.primary);
      stage.pedestal.ringMat.emissiveColor = primary;
      stage.pedestal.innerMat.emissiveColor = color3FromHexInt(next.accent);
      stage.prism.coreMat.emissiveColor = primary;
      stage.rimLight.diffuse = primary;
      stage.beamMat.setColor3('uColor', primary);
      if (stage.particles) {
        stage.particles.material.emissiveColor = color3FromHexInt(next.secondary);
      }
      mediaLoader.load(textures, glbCandidates);
    },
    selectAnimation: (index) => mediaLoader.selectAnimation(index),
    ...createBaseOrbitControls({
      state,
      renderFrame,
      defaultPitch: 0.16,
      defaultRadius: 3.65,
      resize,
    }),
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      if (state.rafId !== null) cancelAnimationFrame(state.rafId);
      cleanupListeners();
      mediaLoader.disposeCurrent();
      disposeBabylonStage(scene, engine);
    },
  };
}

export function mountHolocronBabylonScene(options: HolocronSceneOptions): HolocronSceneController {
  const { canvas } = options;
  const { engine, scene, camera } = createBabylonStageAndCamera(canvas, options.tier);
  const stage = buildHolocronStageObjects(
    scene,
    options.types,
    options.tier,
    options.reducedMotion,
  );
  const state = createStageOrbitState({
    autoRotate: options.autoRotate,
    reducedMotion: options.reducedMotion,
  });
  const mediaLoader = createHologramMediaLoader(
    scene,
    stage.prism,
    () => state.disposed,
    options.onMediaStateChange,
  );
  mediaLoader.load(options.textures, options.glbCandidates);

  const resize = () => resizeBabylonCanvas(canvas, engine, 200);
  resize();

  const renderFrame = createFrameRenderer({
    options,
    scene,
    camera,
    stage,
    mediaLoader,
    state,
  });
  const startLoop = startStageRafLoop({ state, renderFrame });
  const contextObs = engine.onContextLostObservable.add(() => options.onContextLost());
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
    engine,
    stage,
    state,
    mediaLoader,
    renderFrame,
    cleanupListeners: () => {
      engine.onContextLostObservable.remove(contextObs);
      cleanupListeners();
    },
    resize,
  });
}
