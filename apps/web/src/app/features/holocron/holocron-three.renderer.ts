import { type Color, type PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import type { HardwareTier } from '@pokeverse/shared';
import { resolveHolocronPalette } from './holocron-palette.util';
import {
  buildStageObjects,
  createRendererAndCamera,
  createSpriteTextureLoader,
  disposeThreeScene,
} from './holocron-three-scene.util';

export interface HolocronSceneOptions {
  readonly canvas: HTMLCanvasElement;
  readonly tier: HardwareTier;
  readonly reducedMotion: boolean;
  readonly autoRotate: boolean;
  readonly spriteUrl: string | null;
  readonly types: readonly string[];
  readonly readEnergy: (elapsedMs: number) => number;
  readonly onContextLost: () => void;
  readonly onLowFps: () => void;
}

export interface HolocronSceneController {
  readonly updatePokemon: (spriteUrl: string | null, types: readonly string[]) => void;
  readonly setAutoRotate: (enabled: boolean) => void;
  readonly setReducedMotion: (reduced: boolean) => void;
  readonly nudgeOrbit: (deltaRad: number) => void;
  readonly resetCamera: () => void;
  readonly resize: () => void;
  readonly dispose: () => void;
}

interface OrbitState {
  autoRotate: boolean;
  reducedMotion: boolean;
  orbitAngle: number;
  cameraRadius: number;
  dragging: boolean;
  lastPointerX: number;
  disposed: boolean;
  rafId: number | null;
  lastFrameMs: number;
  fpsWindowStart: number;
  fpsFrames: number;
  lowFpsReported: boolean;
}

function bindInteractionListeners(
  canvas: HTMLCanvasElement,
  state: OrbitState,
  onVisibilityResume: () => void,
  onContextLost: () => void,
  onResize: () => void,
): () => void {
  const onPointerDown = (event: PointerEvent) => {
    state.dragging = true;
    state.lastPointerX = event.clientX;
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!state.dragging) return;
    const dx = event.clientX - state.lastPointerX;
    state.lastPointerX = event.clientX;
    state.orbitAngle += dx * 0.012;
  };
  const onPointerUp = () => {
    state.dragging = false;
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    state.cameraRadius = Math.max(2.9, Math.min(5.6, state.cameraRadius + event.deltaY * 0.002));
  };
  const onVisibilityChange = () => {
    if (document.hidden && state.rafId !== null) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
      return;
    }
    onVisibilityResume();
  };
  const handleContextLost = (event: Event) => {
    event.preventDefault();
    if (state.rafId !== null) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    onContextLost();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('webglcontextlost', handleContextLost);
  document.addEventListener('visibilitychange', onVisibilityChange);

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
  if (observer && canvas.parentElement) observer.observe(canvas.parentElement);

  return () => {
    observer?.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('webglcontextlost', handleContextLost);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

function advanceFpsWatchdog(state: OrbitState, now: number, onLowFps: () => void): void {
  state.fpsFrames += 1;
  if (state.lowFpsReported || now - state.fpsWindowStart < 3000) return;
  const avgFps = (state.fpsFrames * 1000) / (now - state.fpsWindowStart);
  if (avgFps < 35) {
    state.lowFpsReported = true;
    onLowFps();
  }
  state.fpsWindowStart = now;
  state.fpsFrames = 0;
}

function createInitialOrbitState(options: HolocronSceneOptions): OrbitState {
  const now = performance.now();
  return {
    autoRotate: options.autoRotate,
    reducedMotion: options.reducedMotion,
    orbitAngle: 0,
    cameraRadius: 4.1,
    dragging: false,
    lastPointerX: 0,
    disposed: false,
    rafId: null,
    lastFrameMs: now,
    fpsWindowStart: now,
    fpsFrames: 0,
    lowFpsReported: false,
  };
}

function createFrameRenderer(
  options: HolocronSceneOptions,
  scene: Scene,
  camera: PerspectiveCamera,
  renderer: WebGLRenderer,
  stage: ReturnType<typeof buildStageObjects>,
  state: OrbitState,
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
    if (!state.reducedMotion && state.autoRotate && !state.dragging) state.orbitAngle += dt * 0.55;
    const bob = state.reducedMotion ? 0 : Math.sin(now * 0.0022) * 0.05 + energy * 0.08;
    stage.spriteMesh.position.y = 0.34 + bob;
    if (stage.particles && !state.reducedMotion) {
      stage.particles.points.rotation.y = state.orbitAngle * 0.65;
    }
    camera.position.x = Math.sin(state.orbitAngle) * state.cameraRadius;
    camera.position.z = Math.cos(state.orbitAngle) * state.cameraRadius;
    camera.lookAt(0, 0.22, 0);
    stage.spriteMesh.rotation.y = state.orbitAngle;
    renderer.render(scene, camera);
    advanceFpsWatchdog(state, now, options.onLowFps);
  };
}

function buildSceneController(params: {
  readonly scene: Scene;
  readonly renderer: WebGLRenderer;
  readonly stage: ReturnType<typeof buildStageObjects>;
  readonly state: OrbitState;
  readonly textureLoader: ReturnType<typeof createSpriteTextureLoader>;
  readonly renderFrame: (now: number) => void;
  readonly cleanupListeners: () => void;
  readonly resize: () => void;
}): HolocronSceneController {
  const { scene, renderer, stage, state, textureLoader, renderFrame, cleanupListeners, resize } =
    params;
  return {
    updatePokemon(spriteUrl, types) {
      const next = resolveHolocronPalette(types);
      stage.pedestal.ringMat.color.setHex(next.primary);
      stage.pedestal.innerMat.color.setHex(next.accent);
      stage.rimLight.color.setHex(next.primary);
      const uColor = stage.beamMat.uniforms['uColor'];
      if (uColor) (uColor.value as Color).setHex(next.primary);
      stage.particles?.material.color.setHex(next.secondary);
      textureLoader.load(spriteUrl);
    },
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
      state.cameraRadius = 4.1;
      renderFrame(performance.now());
    },
    resize,
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      if (state.rafId !== null) cancelAnimationFrame(state.rafId);
      cleanupListeners();
      textureLoader.disposeCurrent();
      disposeThreeScene(scene, renderer);
    },
  };
}

export function mountHolocronThreeScene(options: HolocronSceneOptions): HolocronSceneController {
  const { canvas } = options;
  const scene = new Scene();
  const { camera, renderer } = createRendererAndCamera(canvas, options.tier);
  const stage = buildStageObjects(scene, options.types, options.tier, options.reducedMotion);
  const state = createInitialOrbitState(options);
  const textureLoader = createSpriteTextureLoader(stage.spriteMat, () => state.disposed);
  textureLoader.load(options.spriteUrl);

  const resize = () => {
    const parent = canvas.parentElement;
    const width = Math.max(240, parent?.clientWidth ?? canvas.clientWidth ?? 360);
    const height = Math.max(220, parent?.clientHeight ?? canvas.clientHeight ?? 300);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();

  const renderFrame = createFrameRenderer(options, scene, camera, renderer, stage, state);
  const loop = (now: number) => {
    if (state.disposed || document.hidden) {
      state.rafId = null;
      return;
    }
    renderFrame(now);
    state.rafId = requestAnimationFrame(loop);
  };
  const startLoop = () => {
    if (state.disposed || state.rafId !== null || document.hidden) return;
    state.lastFrameMs = performance.now();
    state.fpsWindowStart = state.lastFrameMs;
    state.fpsFrames = 0;
    state.rafId = requestAnimationFrame(loop);
  };

  const cleanupListeners = bindInteractionListeners(
    canvas,
    state,
    startLoop,
    options.onContextLost,
    resize,
  );
  startLoop();

  return buildSceneController({
    scene,
    renderer,
    stage,
    state,
    textureLoader,
    renderFrame,
    cleanupListeners,
    resize,
  });
}
