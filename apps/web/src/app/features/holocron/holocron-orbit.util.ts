import type { PerspectiveCamera } from 'three';

export interface StageOrbitState {
  autoRotate: boolean;
  reducedMotion: boolean;
  orbitAngle: number;
  orbitPitch: number;
  cameraRadius: number;
  dragging: boolean;
  lastPointerX: number;
  lastPointerY: number;
  disposed: boolean;
  rafId: number | null;
  lastFrameMs: number;
  fpsWindowStart: number;
  fpsFrames: number;
  lowFpsReported: boolean;
}

export function createStageOrbitState(params: {
  readonly autoRotate: boolean;
  readonly reducedMotion: boolean;
  readonly orbitPitch?: number;
  readonly cameraRadius?: number;
}): StageOrbitState {
  const now = performance.now();
  return {
    autoRotate: params.autoRotate,
    reducedMotion: params.reducedMotion,
    orbitAngle: 0,
    orbitPitch: params.orbitPitch ?? 0.16,
    cameraRadius: params.cameraRadius ?? 3.65,
    dragging: false,
    lastPointerX: 0,
    lastPointerY: 0,
    disposed: false,
    rafId: null,
    lastFrameMs: now,
    fpsWindowStart: now,
    fpsFrames: 0,
    lowFpsReported: false,
  };
}

function bindPointerAndWheel(params: {
  readonly canvas: HTMLCanvasElement;
  readonly state: StageOrbitState;
  readonly minRadius: number;
  readonly maxRadius: number;
}): () => void {
  const { canvas, state, minRadius, maxRadius } = params;
  const onPointerDown = (event: PointerEvent) => {
    state.dragging = true;
    state.lastPointerX = event.clientX;
    state.lastPointerY = event.clientY;
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!state.dragging) return;
    state.orbitAngle += (event.clientX - state.lastPointerX) * 0.012;
    state.orbitPitch = Math.max(
      -0.35,
      Math.min(0.55, state.orbitPitch + (event.clientY - state.lastPointerY) * 0.008),
    );
    state.lastPointerX = event.clientX;
    state.lastPointerY = event.clientY;
  };
  const onPointerUp = () => {
    state.dragging = false;
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    state.cameraRadius = Math.max(
      minRadius,
      Math.min(maxRadius, state.cameraRadius + event.deltaY * 0.002),
    );
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  globalThis.addEventListener('pointermove', onPointerMove);
  globalThis.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    globalThis.removeEventListener('pointermove', onPointerMove);
    globalThis.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
  };
}

export function bindStageCanvasListeners(params: {
  readonly canvas: HTMLCanvasElement;
  readonly state: StageOrbitState;
  readonly minRadius: number;
  readonly maxRadius: number;
  readonly onVisibilityResume: () => void;
  readonly onContextLost: () => void;
  readonly onResize: () => void;
}): () => void {
  const { canvas, state, minRadius, maxRadius, onVisibilityResume, onContextLost, onResize } =
    params;
  const unbindInput = bindPointerAndWheel({ canvas, state, minRadius, maxRadius });

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

  canvas.addEventListener('webglcontextlost', handleContextLost);
  document.addEventListener('visibilitychange', onVisibilityChange);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
  if (observer && canvas.parentElement) observer.observe(canvas.parentElement);

  return () => {
    observer?.disconnect();
    unbindInput();
    canvas.removeEventListener('webglcontextlost', handleContextLost);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

export function advanceStageFpsWatchdog(
  state: StageOrbitState,
  now: number,
  onLowFps: () => void,
): void {
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

export function applyCameraOrbit(
  camera: PerspectiveCamera,
  state: StageOrbitState,
  targetY: number,
): void {
  const horiz = Math.cos(state.orbitPitch) * state.cameraRadius;
  camera.position.x = Math.sin(state.orbitAngle) * horiz;
  camera.position.z = Math.cos(state.orbitAngle) * horiz;
  camera.position.y = targetY + Math.sin(state.orbitPitch) * state.cameraRadius;
  camera.lookAt(0, targetY, 0);
}

export function startStageRafLoop(params: {
  readonly state: StageOrbitState;
  readonly renderFrame: (now: number) => void;
}) {
  const { state, renderFrame } = params;
  const loop = (now: number) => {
    if (state.disposed || document.hidden) {
      state.rafId = null;
      return;
    }
    renderFrame(now);
    state.rafId = requestAnimationFrame(loop);
  };
  return () => {
    if (state.disposed || state.rafId !== null || document.hidden) return;
    state.lastFrameMs = performance.now();
    state.fpsWindowStart = state.lastFrameMs;
    state.fpsFrames = 0;
    state.rafId = requestAnimationFrame(loop);
  };
}
