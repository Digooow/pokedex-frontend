export type BabylonScaffoldKind =
  'character-controller' | 'hud-overlay-bridge' | 'pbr-stage-prop' | 'hologram-shader';

export interface BabylonScaffoldInput {
  readonly moduleName: string;
  readonly kind: BabylonScaffoldKind;
  readonly enableHavok: boolean;
  readonly hardwareTier: 'ultra' | 'balanced' | 'lite';
}

function toKebabCase(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter(Boolean)
    .join('-');
}

function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join('');
}

export function buildBabylonScaffold(input: BabylonScaffoldInput) {
  const slug = toKebabCase(input.moduleName) || 'game-scene';
  const symbol = toPascalCase(slug);
  const physicsBlock = input.enableHavok
    ? [
        `import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';`,
        `import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';`,
        `import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';`,
        `import HavokPhysics from '@babylonjs/havok';`,
      ].join('\n')
    : '';

  const initLines = [
    `import { Engine } from '@babylonjs/core/Engines/engine';`,
    `import { Scene } from '@babylonjs/core/scene';`,
    `import { Vector3 } from '@babylonjs/core/Maths/math.vector';`,
    `import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';`,
    `import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';`,
    physicsBlock,
    '',
    `export async function mount${symbol}BabylonStage(canvas: HTMLCanvasElement) {`,
    `  const engine = new Engine(canvas, ${input.hardwareTier === 'ultra'}, { preserveDrawingBuffer: false });`,
    `  const scene = new Scene(engine);`,
    `  const camera = new ArcRotateCamera('${slug}-cam', Math.PI / 2, 1.32, 4.2, Vector3.Zero(), scene);`,
    `  camera.attachControl(canvas, true);`,
    `  new HemisphericLight('${slug}-hemi', new Vector3(0, 1, 0), scene);`,
    input.enableHavok
      ? `  const havok = await HavokPhysics({ locateFile: (f) => '/assets/havok/' + f });\n  scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));`
      : '',
    `  engine.runRenderLoop(() => scene.render());`,
    `  return { engine, scene, dispose: () => { scene.dispose(); engine.dispose(); } };`,
    `}`,
  ]
    .filter((line) => line !== '')
    .join('\n');

  return {
    moduleName: slug,
    symbolName: `mount${symbol}BabylonStage`,
    kind: input.kind,
    suggestedFilePath: `apps/web/src/app/features/game-engine/${slug}-babylon.stage.ts`,
    notes: [
      'Always lazy-import Babylon stages via InjectionToken or @defer to protect initial bundle budget.',
      'Configure DracoDecoder.DefaultConfiguration and Havok locateFile to self-hosted /assets/* paths.',
      'Run engine.runRenderLoop outside Angular change detection and dispose Scene + Engine in ngOnDestroy.',
    ],
    code: initLines,
  };
}
