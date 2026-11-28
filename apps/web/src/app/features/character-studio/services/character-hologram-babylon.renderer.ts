import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { Engine } from '@babylonjs/core/Engines/engine';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { CharacterBodyModel, CharacterOriginKey } from '@pokeverse/shared';
import { enableStageHavokPhysics } from '../../../core/engine-ports/babylon-physics.util';
import {
  addBabylonStageLights,
  color3FromHexInt,
  createBabylonBeamCone,
  createBabylonParticleField,
  createBabylonPedestal,
  createBabylonStageAndCamera,
  disposeBabylonStage,
  resizeBabylonCanvas,
} from '../../../core/engine-ports/babylon-stage.util';
import type {
  CharacterHologramSceneController,
  CharacterHologramSceneOptions,
} from '../../../core/engine-ports/avatar-stage.port';
import { syncAnimationGroupsMotion } from '../../holocron/holocron-animation.util';
import {
  type StageOrbitState,
  advanceStageFpsWatchdog,
  applyCameraOrbit,
  bindStageCanvasListeners,
  createBaseOrbitControls,
  createStageOrbitState,
  startStageRafLoop,
} from '../../holocron/holocron-orbit.util';
import type { HolocronPalette } from '../../holocron/holocron-palette.util';
import {
  type CharacterStageRuntime,
  clearCharacterAnchor,
  createCharacterStageRuntime,
  loadCharacterModelForBody,
  selectRuntimeAnimation,
  tickCharacterProceduralIdle,
} from './character-hologram-loader.util';

const ORIGIN_ACCENT: Readonly<Record<CharacterOriginKey, number>> = {
  settler: 0xfbbf24,
  harbor: 0x38bdf8,
  highlands: 0xf97316,
};

function resolvePalette(body: CharacterBodyModel, origin: CharacterOriginKey): HolocronPalette {
  return {
    primary: body === 'female' ? 0x22d3ee : 0x38bdf8,
    secondary: body === 'female' ? 0xa5f3fc : 0x67e8f9,
    accent: ORIGIN_ACCENT[origin],
  };
}

function buildStageObjects(scene: Scene, options: CharacterHologramSceneOptions) {
  const palette = resolvePalette(options.bodyModel, options.originKey);
  const rimLight = addBabylonStageLights(scene, palette.primary);
  const pedestal = createBabylonPedestal(scene, palette);
  const beamMat = createBabylonBeamCone(scene, palette);
  let count = 0;
  if (!options.reducedMotion) {
    count = options.tier === 'ultra' ? 110 : 54;
  }
  const particles = count > 0 ? createBabylonParticleField(scene, palette, count) : null;
  const modelAnchor = new TransformNode('char-model-anchor', scene);
  return { rimLight, pedestal, beamMat, particles, modelAnchor };
}

function createFrameRenderer(params: {
  readonly scene: Scene;
  readonly camera: FreeCamera;
  readonly stage: ReturnType<typeof buildStageObjects>;
  readonly runtime: CharacterStageRuntime;
  readonly state: StageOrbitState;
  readonly onLowFps: () => void;
}) {
  const { scene, camera, stage, runtime, state, onLowFps } = params;
  return (now: number) => {
    if (state.disposed) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - state.lastFrameMs) / 1000));
    state.lastFrameMs = now;
    stage.beamMat.setFloat('uTime', now * 0.001);
    stage.beamMat.setFloat('uEnergy', 0.35);
    if (!state.reducedMotion && state.autoRotate && !state.dragging) state.orbitAngle += dt * 0.58;
    syncAnimationGroupsMotion(
      runtime.animationGroups,
      runtime.activeClipIndex,
      state.reducedMotion,
    );
    tickCharacterProceduralIdle(runtime.proceduralPose, now * 0.001, state.reducedMotion);
    if (stage.particles && !state.reducedMotion) {
      stage.particles.mesh.rotation.y = state.orbitAngle * 0.65;
    }
    applyCameraOrbit(camera, state, 0.16);
    scene.render();
    advanceStageFpsWatchdog(state, now, onLowFps);
  };
}

function applyStagePalette(
  stage: ReturnType<typeof buildStageObjects>,
  body: CharacterBodyModel,
  origin: CharacterOriginKey,
): void {
  const next = resolvePalette(body, origin);
  const primary = color3FromHexInt(next.primary);
  stage.pedestal.ringMat.emissiveColor = primary;
  stage.pedestal.innerMat.emissiveColor = color3FromHexInt(next.accent);
  stage.rimLight.diffuse = primary;
  stage.beamMat.setColor3('uColor', primary);
  if (stage.particles) {
    stage.particles.material.emissiveColor = color3FromHexInt(next.secondary);
  }
}

function buildController(params: {
  readonly options: CharacterHologramSceneOptions;
  readonly scene: Scene;
  readonly engine: Engine;
  readonly stage: ReturnType<typeof buildStageObjects>;
  readonly runtime: CharacterStageRuntime;
  readonly state: StageOrbitState;
  readonly renderFrame: (now: number) => void;
  readonly cleanupListeners: () => void;
  readonly resize: () => void;
}): CharacterHologramSceneController {
  const { options, scene, engine, stage, runtime, state, renderFrame, cleanupListeners, resize } =
    params;
  let activeBody = options.bodyModel;
  let activeOrigin = options.originKey;
  return {
    setBodyModel(nextBody) {
      if (nextBody === activeBody) return;
      activeBody = nextBody;
      applyStagePalette(stage, activeBody, activeOrigin);
      void loadCharacterModelForBody({
        runtime,
        bodyModel: activeBody,
        isDisposed: () => state.disposed,
        onMediaState: options.onMediaStateChange,
      });
    },
    setOriginKey(nextOrigin) {
      activeOrigin = nextOrigin;
      applyStagePalette(stage, activeBody, activeOrigin);
    },
    selectAnimation: (index) => selectRuntimeAnimation(runtime, index),
    ...createBaseOrbitControls({
      state,
      renderFrame,
      defaultPitch: 0.14,
      defaultRadius: 3.45,
      resize,
    }),
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      runtime.requestEpoch += 1;
      runtime.abortController?.abort();
      if (state.rafId !== null) cancelAnimationFrame(state.rafId);
      cleanupListeners();
      clearCharacterAnchor(runtime);
      disposeBabylonStage(scene, engine);
    },
  };
}

export function mountCharacterHologramScene(
  options: CharacterHologramSceneOptions,
): CharacterHologramSceneController {
  const { canvas } = options;
  const { engine, scene, camera } = createBabylonStageAndCamera(canvas, options.tier);
  if (options.enablePhysics) {
    void enableStageHavokPhysics(scene);
  }
  const stage = buildStageObjects(scene, options);
  const state = createStageOrbitState({
    autoRotate: options.autoRotate,
    reducedMotion: options.reducedMotion,
    orbitPitch: 0.14,
    cameraRadius: 3.45,
  });
  const runtime = createCharacterStageRuntime(scene, stage.modelAnchor);
  const resize = () => resizeBabylonCanvas(canvas, engine, 240);
  resize();

  const renderFrame = createFrameRenderer({
    scene,
    camera,
    stage,
    runtime,
    state,
    onLowFps: options.onLowFps,
  });
  const startLoop = startStageRafLoop({ state, renderFrame });
  const contextObs = engine.onContextLostObservable.add(() => options.onContextLost());
  const cleanupListeners = bindStageCanvasListeners({
    canvas,
    state,
    minRadius: 2.1,
    maxRadius: 4.8,
    onVisibilityResume: startLoop,
    onContextLost: options.onContextLost,
    onResize: resize,
  });
  startLoop();
  void loadCharacterModelForBody({
    runtime,
    bodyModel: options.bodyModel,
    isDisposed: () => state.disposed,
    onMediaState: options.onMediaStateChange,
  });
  return buildController({
    options,
    scene,
    engine,
    stage,
    runtime,
    state,
    renderFrame,
    cleanupListeners: () => {
      engine.onContextLostObservable.remove(contextObs);
      cleanupListeners();
    },
    resize,
  });
}
