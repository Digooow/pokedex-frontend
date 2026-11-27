import type { HardwareTier } from '@pokeverse/shared';
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  FrontSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  RingGeometry,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  TorusGeometry,
  WebGLRenderer,
} from 'three';
import type { HologramPrismRig } from './holocron-media-loader.util';
import {
  type HolocronPalette,
  computeDeterministicParticleCoord,
  resolveHolocronPalette,
} from './holocron-palette.util';

const BEAM_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BEAM_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uEnergy;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float scan = 0.5 + 0.5 * sin((vUv.y * 28.0) - (uTime * 4.2));
    float fade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
    float alpha = (0.12 + (0.12 * scan) + (0.18 * uEnergy)) * fade;
    gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 0.32));
  }
`;

export function addHolocronLights(scene: Scene, primaryColor: number): PointLight {
  scene.add(new AmbientLight(0xffffff, 0.55));
  scene.add(new HemisphereLight(0xe0f2fe, 0x1e293b, 1.15));
  const keyLight = new DirectionalLight(0xffffff, 1.65);
  keyLight.position.set(2.5, 4, 3);
  scene.add(keyLight);
  const fillLight = new DirectionalLight(0xbae6fd, 0.65);
  fillLight.position.set(-2.5, 2, -2.5);
  scene.add(fillLight);
  const rimLight = new PointLight(primaryColor, 1.8, 8);
  rimLight.position.set(0, -0.35, 1.2);
  scene.add(rimLight);
  return rimLight;
}

export function createPedestalGroup(palette: HolocronPalette) {
  const group = new Group();
  const baseMat = new MeshStandardMaterial({
    color: 0x162030,
    metalness: 0.78,
    roughness: 0.28,
  });
  const baseMesh = new Mesh(new CylinderGeometry(1.15, 1.35, 0.28, 6), baseMat);
  baseMesh.position.y = -0.82;
  group.add(baseMesh);

  const ringMat = new MeshBasicMaterial({ color: palette.primary });
  const outerRing = new Mesh(new TorusGeometry(1.06, 0.032, 12, 48), ringMat);
  outerRing.rotation.x = Math.PI / 2;
  outerRing.position.y = -0.66;
  group.add(outerRing);

  const innerMat = new MeshBasicMaterial({
    color: palette.accent,
    transparent: true,
    opacity: 0.52,
    side: DoubleSide,
  });
  const innerDisc = new Mesh(new RingGeometry(0.45, 0.92, 32), innerMat);
  innerDisc.rotation.x = -Math.PI / 2;
  innerDisc.position.y = -0.65;
  group.add(innerDisc);

  return { group, ringMat, innerMat };
}

export function createHologramBeamMaterial(palette: HolocronPalette): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uColor: { value: new Color(palette.primary) },
    },
    vertexShader: BEAM_VERTEX_SHADER,
    fragmentShader: BEAM_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
}

export function createParticleField(palette: HolocronPalette, count: number) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const [x, y, z] = computeDeterministicParticleCoord(i, count);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    color: palette.secondary,
    size: 0.06,
    transparent: true,
    opacity: 0.78,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  return { points: new Points(geometry, material), material };
}

function collectObjMaterials(material: Mesh['material'] | undefined): MeshBasicMaterial[] {
  if (!material) return [];
  return (Array.isArray(material) ? material : [material]) as MeshBasicMaterial[];
}

export function disposeObjectSubtree(root: Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Partial<Mesh & Points>;
    mesh.geometry?.dispose();
    for (const mat of collectObjMaterials(mesh.material)) {
      const pbr = mat as unknown as Partial<MeshStandardMaterial>;
      mat.map?.dispose();
      pbr.emissiveMap?.dispose();
      pbr.normalMap?.dispose();
      pbr.roughnessMap?.dispose();
      pbr.metalnessMap?.dispose();
      mat.dispose();
    }
  });
}

export function disposeThreeScene(scene: Scene, renderer: WebGLRenderer): void {
  disposeObjectSubtree(scene);
  renderer.dispose();
}

function createHologramPrism(palette: HolocronPalette): HologramPrismRig {
  const hologramGroup = new Group();
  hologramGroup.position.y = 0.34;

  const prismGroup = new Group();
  const frontMat = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.96,
    side: FrontSide,
    depthWrite: false,
  });
  const backMat = new MeshBasicMaterial({
    color: 0x93c5fd,
    transparent: true,
    opacity: 0.92,
    side: FrontSide,
    depthWrite: false,
  });
  const frontMesh = new Mesh(new PlaneGeometry(1.65, 1.65), frontMat);
  frontMesh.position.z = 0.04;
  const backMesh = new Mesh(new PlaneGeometry(1.65, 1.65), backMat);
  backMesh.position.z = -0.04;
  backMesh.rotation.y = Math.PI;

  const coreMat = new MeshBasicMaterial({
    color: palette.primary,
    transparent: true,
    opacity: 0.16,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const coreMesh = new Mesh(new BoxGeometry(1.56, 1.56, 0.06), coreMat);
  prismGroup.add(coreMesh, frontMesh, backMesh);

  const modelAnchor = new Group();
  hologramGroup.add(prismGroup, modelAnchor);
  return { hologramGroup, prismGroup, modelAnchor, frontMat, backMat, coreMat };
}

export function createRendererAndCamera(canvas: HTMLCanvasElement, tier: HardwareTier) {
  const camera = new PerspectiveCamera(38, 1, 0.1, 40);
  camera.position.set(0, 0.85, 3.65);
  camera.lookAt(0, 0.14, 0);

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: tier === 'ultra',
    powerPreference: tier === 'ultra' ? 'high-performance' : 'default',
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, tier === 'ultra' ? 2 : 1.5));
  return { camera, renderer };
}

export function buildStageObjects(
  scene: Scene,
  types: readonly string[],
  tier: HardwareTier,
  reducedMotion: boolean,
) {
  const palette = resolveHolocronPalette(types);
  const rimLight = addHolocronLights(scene, palette.primary);
  const stageGroup = new Group();
  scene.add(stageGroup);

  const pedestal = createPedestalGroup(palette);
  stageGroup.add(pedestal.group);

  const beamMat = createHologramBeamMaterial(palette);
  const beamMesh = new Mesh(new ConeGeometry(1.02, 2.1, 24, 1, true), beamMat);
  beamMesh.position.y = 0.4;
  beamMesh.rotation.x = Math.PI;
  stageGroup.add(beamMesh);

  const prism = createHologramPrism(palette);
  stageGroup.add(prism.hologramGroup);

  let particleCount = 0;
  if (!reducedMotion) {
    particleCount = tier === 'ultra' ? 140 : 64;
  }
  const particles = particleCount > 0 ? createParticleField(palette, particleCount) : null;
  if (particles) stageGroup.add(particles.points);

  return { rimLight, pedestal, beamMat, prism, particles };
}
