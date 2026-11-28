import { type CharacterBodyModel, type CharacterOriginKey } from '@pokeverse/shared';
import {
  ConeGeometry,
  Group,
  Mesh,
  type PerspectiveCamera,
  Scene,
  type WebGLRenderer,
} from 'three';
import type {
  CharacterHologramSceneController,
  CharacterHologramSceneOptions,
} from '../../../core/engine-ports/avatar-stage.port';
import {
  type StageOrbitState,
  advanceStageFpsWatchdog,
  applyCameraOrbit,
  bindStageCanvasListeners,
  createStageOrbitState,
  startStageRafLoop,
} from '../../holocron/holocron-orbit.util';
import type { HolocronPalette } from '../../holocron/holocron-palette.util';
import {
  addHolocronLights,
  createHologramBeamMaterial,
  createParticleField,
  createPedestalGroup,
  createRendererAndCamera,
  disposeThreeScene,
} from '../../holocron/holocron-three-scene.util';
import {
  type CharacterStageRuntime,
  clearCharacterAnchor,
  createCharacterStageRuntime,
  loadCharacterModelForBody,
  selectRuntimeAnimation,
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
  const rimLight = addHolocronLights(scene, palette.primary);
  const pedestal = createPedestalGroup(palette);
  scene.add(pedestal.group);
  const beamMat = createHologramBeamMaterial(palette);
  const beamMesh = new Mesh(new ConeGeometry(1.02, 2.1, 24, 1, true), beamMat);
  beamMesh.position.y = 0.4;
  beamMesh.rotation.x = Math.PI;
  scene.add(beamMesh);
  let count = 0;
  if (!options.reducedMotion) {
    count = options.tier === 'ultra' ? 110 : 54;
  }
  const particles = count > 0 ? createParticleField(palette, count) : null;
  if (particles) scene.add(particles.points);
  const modelAnchor = new Group();
  scene.add(modelAnchor);
  return { rimLight, pedestal, beamMat, particles, modelAnchor };
}

function createFrameRenderer(params: {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly stage: ReturnType<typeof buildStageObjects>;
  readonly runtime: CharacterStageRuntime;
  readonly state: StageOrbitState;
  readonly onLowFps: () => void;
}) {
  const { scene, camera, renderer, stage, runtime, state, onLowFps } = params;
  return (now: number) => {
    if (state.disposed) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - state.lastFrameMs) / 1000));
    state.lastFrameMs = now;
    const uTime = stage.beamMat.uniforms['uTime'];
    const uEnergy = stage.beamMat.uniforms['uEnergy'];
    if (uTime) uTime.value = now * 0.001;
    if (uEnergy) uEnergy.value = 0.35;
    if (!state.reducedMotion && state.autoRotate && !state.dragging) state.orbitAngle += dt * 0.58;
    if (runtime.mixer && !state.reducedMotion) runtime.mixer.update(dt);
    if (stage.particles && !state.reducedMotion) {
      stage.particles.points.rotation.y = state.orbitAngle * 0.65;
    }
    applyCameraOrbit(camera, state, 0.16);
    renderer.render(scene, camera);
    advanceStageFpsWatchdog(state, now, onLowFps);
  };
}

function applyStagePalette(
  stage: ReturnType<typeof buildStageObjects>,
  body: CharacterBodyModel,
  origin: CharacterOriginKey,
): void {
  const next = resolvePalette(body, origin);
  stage.pedestal.ringMat.color.setHex(next.primary);
  stage.pedestal.innerMat.color.setHex(next.accent);
  stage.rimLight.color.setHex(next.primary);
  stage.particles?.material.color.setHex(next.secondary);
}

function buildController(params: {
  readonly options: CharacterHologramSceneOptions;
  readonly scene: Scene;
  readonly renderer: WebGLRenderer;
  readonly stage: ReturnType<typeof buildStageObjects>;
  readonly runtime: CharacterStageRuntime;
  readonly state: StageOrbitState;
  readonly renderFrame: (now: number) => void;
  readonly cleanupListeners: () => void;
  readonly resize: () => void;
}): CharacterHologramSceneController {
  const { options, scene, renderer, stage, runtime, state, renderFrame, cleanupListeners, resize } =
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
      state.orbitPitch = 0.14;
      state.cameraRadius = 3.45;
      renderFrame(performance.now());
    },
    resize,
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      runtime.requestEpoch += 1;
      runtime.abortController?.abort();
      if (state.rafId !== null) cancelAnimationFrame(state.rafId);
      cleanupListeners();
      clearCharacterAnchor(runtime);
      runtime.loader.dispose();
      stage.beamMat.dispose();
      disposeThreeScene(scene, renderer);
    },
  };
}

export function mountCharacterHologramScene(
  options: CharacterHologramSceneOptions,
): CharacterHologramSceneController {
  const { canvas } = options;
  const scene = new Scene();
  const { camera, renderer } = createRendererAndCamera(canvas, options.tier);
  const stage = buildStageObjects(scene, options);
  const state = createStageOrbitState({
    autoRotate: options.autoRotate,
    reducedMotion: options.reducedMotion,
    orbitPitch: 0.14,
    cameraRadius: 3.45,
  });
  const runtime = createCharacterStageRuntime(stage.modelAnchor);
  const resize = () => {
    const parent = canvas.parentElement;
    renderer.setSize(
      Math.max(220, parent?.clientWidth ?? canvas.clientWidth ?? 320),
      Math.max(240, parent?.clientHeight ?? canvas.clientHeight ?? 280),
      false,
    );
    camera.aspect =
      Math.max(220, parent?.clientWidth ?? 320) / Math.max(240, parent?.clientHeight ?? 280);
    camera.updateProjectionMatrix();
  };
  resize();
  const renderFrame = createFrameRenderer({
    scene,
    camera,
    renderer,
    stage,
    runtime,
    state,
    onLowFps: options.onLowFps,
  });
  const startLoop = startStageRafLoop({ state, renderFrame });
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
    renderer,
    stage,
    runtime,
    state,
    renderFrame,
    cleanupListeners,
    resize,
  });
}
