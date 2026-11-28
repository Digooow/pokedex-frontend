import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Engine } from '@babylonjs/core/Engines/engine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { DracoCompression } from '@babylonjs/core/Meshes/Compression/dracoCompression';
import { DracoDecoder } from '@babylonjs/core/Meshes/Compression/dracoDecoder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import type { HardwareTier } from '@pokeverse/shared';
import {
  type HolocronPalette,
  computeDeterministicParticleCoord,
} from '../../features/holocron/holocron-palette.util';

let dracoConfigured = false;

const BEAM_VERTEX_SHADER = `
  precision highp float;
  attribute vec3 position;
  attribute vec2 uv;
  uniform mat4 worldViewProjection;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = worldViewProjection * vec4(position, 1.0);
  }
`;

const BEAM_FRAGMENT_SHADER = `
  precision highp float;
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

export function ensureSelfHostedDraco(): void {
  if (dracoConfigured) return;
  dracoConfigured = true;
  const decoderConfig = {
    wasmUrl: '/assets/draco/draco_wasm_wrapper_gltf.js',
    wasmBinaryUrl: '/assets/draco/draco_decoder_gltf.wasm',
    fallbackUrl: '/assets/draco/draco_decoder_gltf.js',
  };
  DracoDecoder.DefaultConfiguration = { ...DracoDecoder.DefaultConfiguration, ...decoderConfig };
  DracoCompression.Configuration = { decoder: { ...decoderConfig } };
}

export function color3FromHexInt(hex: number): Color3 {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  return new Color3(r, g, b);
}

export function createBabylonStageAndCamera(canvas: HTMLCanvasElement, tier: HardwareTier) {
  ensureSelfHostedDraco();
  const engine = new Engine(canvas, tier === 'ultra', {
    preserveDrawingBuffer: false,
    stencil: false,
    audioEngine: false,
    doNotHandleContextLost: false,
    powerPreference: tier === 'ultra' ? 'high-performance' : 'default',
  });
  const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, tier === 'ultra' ? 2 : 1.5);
  engine.setHardwareScalingLevel(1 / pixelRatio);

  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0, 0, 0, 0);
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 1.12;

  const camera = new FreeCamera('stage-camera', new Vector3(0, 0.85, 3.65), scene);
  camera.fov = (38 * Math.PI) / 180;
  camera.minZ = 0.1;
  camera.maxZ = 40;
  camera.setTarget(new Vector3(0, 0.14, 0));

  return { engine, scene, camera };
}

export function addBabylonStageLights(scene: Scene, primaryColor: number): PointLight {
  const hemi = new HemisphericLight('stage-hemi', new Vector3(0, 1, 0), scene);
  hemi.diffuse = color3FromHexInt(0xe0f2fe);
  hemi.groundColor = color3FromHexInt(0x1e293b);
  hemi.intensity = 1.25;

  const keyLight = new DirectionalLight('stage-key', new Vector3(-2.5, -4, -3).normalize(), scene);
  keyLight.diffuse = Color3.White();
  keyLight.intensity = 1.65;

  const fillLight = new DirectionalLight(
    'stage-fill',
    new Vector3(2.5, -2, 2.5).normalize(),
    scene,
  );
  fillLight.diffuse = color3FromHexInt(0xbae6fd);
  fillLight.intensity = 0.7;

  const rimLight = new PointLight('stage-rim', new Vector3(0, -0.35, 1.2), scene);
  rimLight.diffuse = color3FromHexInt(primaryColor);
  rimLight.intensity = 2.4;
  rimLight.range = 8;
  return rimLight;
}

export function createBabylonPedestal(scene: Scene, palette: HolocronPalette) {
  const group = new TransformNode('pedestal-group', scene);
  const baseMat = new PBRMaterial('pedestal-base-mat', scene);
  baseMat.albedoColor = color3FromHexInt(0x162030);
  baseMat.metallic = 0.78;
  baseMat.roughness = 0.28;
  baseMat.emissiveColor = color3FromHexInt(0x0b1220);

  const baseMesh = CreateCylinder(
    'pedestal-base',
    { diameterTop: 2.3, diameterBottom: 2.7, height: 0.28, tessellation: 6 },
    scene,
  );
  baseMesh.position.y = -0.82;
  baseMesh.material = baseMat;
  baseMesh.parent = group;

  const ringMat = new StandardMaterial('pedestal-ring-mat', scene);
  ringMat.disableLighting = true;
  ringMat.emissiveColor = color3FromHexInt(palette.primary);
  const outerRing = CreateTorus(
    'pedestal-outer-ring',
    { diameter: 2.12, thickness: 0.064, tessellation: 48 },
    scene,
  );
  outerRing.position.y = -0.66;
  outerRing.material = ringMat;
  outerRing.parent = group;

  const innerMat = new StandardMaterial('pedestal-inner-mat', scene);
  innerMat.disableLighting = true;
  innerMat.emissiveColor = color3FromHexInt(palette.accent);
  innerMat.alpha = 0.52;
  innerMat.backFaceCulling = false;
  const innerDisc = CreateDisc('pedestal-inner-disc', { radius: 0.92, tessellation: 32 }, scene);
  innerDisc.rotation.x = Math.PI / 2;
  innerDisc.position.y = -0.65;
  innerDisc.material = innerMat;
  innerDisc.parent = group;

  return { group, ringMat, innerMat };
}

export function createBabylonBeamCone(scene: Scene, palette: HolocronPalette): ShaderMaterial {
  const beamMat = new ShaderMaterial(
    'holo-beam-shader',
    scene,
    { vertexSource: BEAM_VERTEX_SHADER, fragmentSource: BEAM_FRAGMENT_SHADER },
    {
      attributes: ['position', 'uv'],
      uniforms: ['worldViewProjection', 'uTime', 'uEnergy', 'uColor'],
      needAlphaBlending: true,
    },
  );
  beamMat.backFaceCulling = false;
  beamMat.alphaMode = Constants.ALPHA_ADD;
  beamMat.disableDepthWrite = true;
  beamMat.setFloat('uTime', 0);
  beamMat.setFloat('uEnergy', 0);
  beamMat.setColor3('uColor', color3FromHexInt(palette.primary));

  const beamMesh = CreateCylinder(
    'holo-beam',
    { diameterTop: 2.04, diameterBottom: 0.04, height: 2.1, tessellation: 24, cap: Mesh.NO_CAP },
    scene,
  );
  beamMesh.position.y = 0.4;
  beamMesh.material = beamMat;
  return beamMat;
}

export function createBabylonParticleField(scene: Scene, palette: HolocronPalette, count: number) {
  const positions: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const [x, y, z] = computeDeterministicParticleCoord(i, count);
    positions.push(x, y, z);
  }
  const mesh = new Mesh('holo-particles', scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.applyToMesh(mesh);

  const material = new StandardMaterial('holo-particles-mat', scene);
  material.pointsCloud = true;
  material.pointSize = 3.6;
  material.disableLighting = true;
  material.emissiveColor = color3FromHexInt(palette.secondary);
  material.alpha = 0.78;
  material.alphaMode = Constants.ALPHA_ADD;
  material.disableDepthWrite = true;
  mesh.material = material;

  return { mesh, material };
}

export function resizeBabylonCanvas(
  canvas: HTMLCanvasElement,
  engine: Engine,
  minHeight = 200,
): void {
  const parent = canvas.parentElement;
  const width = Math.max(220, parent?.clientWidth ?? canvas.clientWidth ?? 320);
  const height = Math.max(minHeight, parent?.clientHeight ?? canvas.clientHeight ?? 260);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  engine.resize();
}

export function disposeBabylonStage(scene: Scene, engine: Engine): void {
  scene.dispose();
  engine.dispose();
}
