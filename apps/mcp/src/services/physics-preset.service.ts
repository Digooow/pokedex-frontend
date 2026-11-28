export type PhysicsEntityKind =
  'character-capsule' | 'dynamic-prop' | 'projectile' | 'vehicle-chassis' | 'static-terrain';

export interface PhysicsPresetInput {
  readonly entityKind: PhysicsEntityKind;
  readonly massKg: number;
  readonly gravityMps2: number;
  readonly jumpVelocityMps: number;
  readonly moveSpeedMps: number;
  readonly friction: number;
  readonly restitution: number;
  readonly linearDamping: number;
  readonly capsuleRadiusM: number;
  readonly capsuleHeightM: number;
  readonly stepHz: 60 | 120;
}

export interface PhysicsSimulationReport {
  readonly entityKind: PhysicsEntityKind;
  readonly motionType: 'STATIC' | 'DYNAMIC' | 'KINEMATIC';
  readonly recommendedHavokShape: 'CAPSULE' | 'BOX' | 'SPHERE' | 'MESH';
  readonly stepDtSec: number;
  readonly gravityAbsMps2: number;
  readonly jumpApexHeightM: number;
  readonly jumpAirTimeSec: number;
  readonly moveKineticEnergyJ: number;
  readonly warnings: readonly string[];
  readonly babylonHavokSnippet: string;
}

const SHAPE_BY_KIND: Readonly<
  Record<PhysicsEntityKind, PhysicsSimulationReport['recommendedHavokShape']>
> = {
  'character-capsule': 'CAPSULE',
  'dynamic-prop': 'BOX',
  projectile: 'SPHERE',
  'vehicle-chassis': 'BOX',
  'static-terrain': 'MESH',
};

function buildHavokSnippet(
  input: PhysicsPresetInput,
  shape: PhysicsSimulationReport['recommendedHavokShape'],
): string {
  const mass = input.entityKind === 'static-terrain' ? 0 : input.massKg;
  return [
    `const aggregate = new PhysicsAggregate(mesh, PhysicsShapeType.${shape}, {`,
    `  mass: ${mass},`,
    `  friction: ${input.friction},`,
    `  restitution: ${input.restitution},`,
    `}, scene);`,
    `aggregate.body.setLinearDamping(${input.linearDamping});`,
    input.entityKind === 'character-capsule'
      ? 'aggregate.body.setMassProperties({ inertia: Vector3.Zero() });'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function collectPhysicsWarnings(input: PhysicsPresetInput): string[] {
  const warnings: string[] = [];
  if (input.entityKind !== 'static-terrain' && input.massKg <= 0) {
    warnings.push('Dynamic entities require massKg > 0; Havok treats mass=0 as STATIC.');
  }
  if (input.entityKind === 'character-capsule' && input.capsuleHeightM < input.capsuleRadiusM * 2) {
    warnings.push('capsuleHeightM must be >= 2 * capsuleRadiusM for a valid Havok capsule.');
  }
  if (input.restitution > 0.9) {
    warnings.push('Restitution > 0.9 can cause unstable micro-bouncing on stacked colliders.');
  }
  if (input.entityKind === 'projectile' && input.moveSpeedMps > 35 && input.stepHz === 60) {
    warnings.push('Fast projectile (>35 m/s) at 60 Hz risks tunneling; raise stepHz to 120.');
  }
  return warnings;
}

export function simulatePhysicsPreset(input: PhysicsPresetInput): PhysicsSimulationReport {
  const gravityAbsMps2 = Math.max(0.01, Math.abs(input.gravityMps2));
  const jumpApexHeightM = Number(
    ((input.jumpVelocityMps * input.jumpVelocityMps) / (2 * gravityAbsMps2)).toFixed(3),
  );
  const jumpAirTimeSec = Number(((2 * input.jumpVelocityMps) / gravityAbsMps2).toFixed(3));
  const moveKineticEnergyJ = Number(
    (0.5 * input.massKg * input.moveSpeedMps * input.moveSpeedMps).toFixed(2),
  );
  const shape = SHAPE_BY_KIND[input.entityKind];
  const motionType = input.entityKind === 'static-terrain' ? 'STATIC' : 'DYNAMIC';

  return {
    entityKind: input.entityKind,
    motionType,
    recommendedHavokShape: shape,
    stepDtSec: Number((1 / input.stepHz).toFixed(5)),
    gravityAbsMps2,
    jumpApexHeightM,
    jumpAirTimeSec,
    moveKineticEnergyJ,
    warnings: collectPhysicsWarnings(input),
    babylonHavokSnippet: buildHavokSnippet(input, shape),
  };
}
