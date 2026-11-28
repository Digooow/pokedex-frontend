import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCharacterDevkitCatalog } from '../services/character-blueprint.service.js';
import { readDesignTokens, readWebBudgets } from '../services/hud-devkit.service.js';
import { simulatePhysicsPreset } from '../services/physics-preset.service.js';
import { inspectTextureDirectory } from '../services/texture-toolkit.service.js';

interface ResourceSpec {
  readonly name: string;
  readonly uri: string;
  readonly title: string;
  readonly description: string;
  readonly mimeType: string;
  readonly buildPayload: (repoRoot: string) => unknown;
}

const RESOURCE_SPECS: readonly ResourceSpec[] = [
  {
    name: 'devkit-architecture',
    uri: 'pokeverse://devkit/architecture',
    title: 'Game Devkit Architecture',
    description:
      'Engine stack (Babylon.js + Havok WASM + Angular Zoneless HUD + Blender + Figma) and strict CSP/quality rules.',
    mimeType: 'application/json',
    buildPayload: () => ({
      engine: 'Babylon.js (@babylonjs/core + @babylonjs/loaders)',
      physics: 'Havok Physics WASM (@babylonjs/havok) via self-hosted /assets/havok/',
      draco: 'Self-hosted Draco decoder via /assets/draco/',
      hudLayer: 'Angular 22 Standalone + Signals overlay with --pv-* design tokens',
      artPipeline: ['Blender (mcp-for-blender)', 'Figma (figma_figma MCP)', 'GLB 2.0 + WebP/KTX2'],
      qualityGates: ['ESLint SonarJS', 'CPD 0%', 'Strict Zod', 'UI Quality Gate'],
    }),
  },
  {
    name: 'design-tokens',
    uri: 'pokeverse://devkit/design-tokens',
    title: 'Web HUD Design Tokens (--pv-*)',
    description: 'Semantic CSS custom properties extracted from apps/web/src/styles/_tokens.scss.',
    mimeType: 'application/json',
    buildPayload: (repoRoot) => ({
      source: 'apps/web/src/styles/_tokens.scss',
      tokens: readDesignTokens(repoRoot),
      webBudgets: readWebBudgets(repoRoot),
    }),
  },
  {
    name: 'assets-manifest',
    uri: 'pokeverse://devkit/assets-manifest',
    title: 'Workspace Assets Manifest',
    description: 'Live audit of textures and public assets under apps/web/public/assets.',
    mimeType: 'application/json',
    buildPayload: (repoRoot) => inspectTextureDirectory(repoRoot, 'apps/web/public/assets'),
  },
  {
    name: 'babylon-havok-presets',
    uri: 'pokeverse://devkit/babylon-havok-presets',
    title: 'Babylon.js + Havok Physics Presets',
    description:
      'Reference physics presets for player capsule, dynamic prop, projectile, and static terrain.',
    mimeType: 'application/json',
    buildPayload: () => ({
      playerCapsule: simulatePhysicsPreset({
        entityKind: 'character-capsule',
        massKg: 72,
        gravityMps2: -9.81,
        jumpVelocityMps: 6.4,
        moveSpeedMps: 6.5,
        friction: 0.45,
        restitution: 0.02,
        linearDamping: 0.15,
        capsuleRadiusM: 0.35,
        capsuleHeightM: 1.75,
        stepHz: 60,
      }),
      projectileFast: simulatePhysicsPreset({
        entityKind: 'projectile',
        massKg: 0.4,
        gravityMps2: -9.81,
        jumpVelocityMps: 0,
        moveSpeedMps: 45,
        friction: 0.1,
        restitution: 0.2,
        linearDamping: 0.02,
        capsuleRadiusM: 0.15,
        capsuleHeightM: 0.3,
        stepHz: 120,
      }),
    }),
  },
  {
    name: 'character-catalog',
    uri: 'pokeverse://devkit/character-catalog',
    title: 'Character & Skill Progression Catalog',
    description:
      'Origins, 3D body models, presets, emergent archetypes, and skill tree from @pokeverse/shared.',
    mimeType: 'application/json',
    buildPayload: () => getCharacterDevkitCatalog(),
  },
];

export function registerDevkitResources(server: McpServer, repoRoot: string): void {
  for (const spec of RESOURCE_SPECS) {
    server.registerResource(
      spec.name,
      spec.uri,
      {
        title: spec.title,
        description: spec.description,
        mimeType: spec.mimeType,
      },
      (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: spec.mimeType,
            text: JSON.stringify(spec.buildPayload(repoRoot), null, 2),
          },
        ],
      }),
    );
  }
}
