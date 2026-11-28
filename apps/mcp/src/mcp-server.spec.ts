import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createPokeverseMcpServer } from './server.js';
import { buildBabylonScaffold } from './services/babylon-scaffold.service.js';
import { buildCharacterBlueprint } from './services/character-blueprint.service.js';
import { inspectGlbBuffer, inspectWorkspaceGlbAsset } from './services/glb-inspector.service.js';
import { evaluateWcagContrast, readDesignTokens } from './services/hud-devkit.service.js';
import { simulatePhysicsPreset } from './services/physics-preset.service.js';
import {
  generateProceduralTextureAsset,
  inspectTextureDirectory,
} from './services/texture-toolkit.service.js';
import { findRepoRoot, resolveSafeWorkspacePath } from './utils/path-sandbox.util.js';

const REPO_ROOT = findRepoRoot(import.meta.dirname);

describe('PokéVerse Game Devkit MCP Server', () => {
  it('blocks path traversal, absolute paths, and writes outside generated textures directory', () => {
    expect(() =>
      resolveSafeWorkspacePath({ repoRoot: REPO_ROOT, relativePath: '../outside.txt' }),
    ).toThrow(/escapes/i);

    expect(() =>
      resolveSafeWorkspacePath({
        repoRoot: REPO_ROOT,
        relativePath: path.resolve(REPO_ROOT, 'package.json'),
      }),
    ).toThrow(/relative/i);

    expect(() =>
      resolveSafeWorkspacePath({
        repoRoot: REPO_ROOT,
        relativePath: 'apps/web/src/evil.svg',
        allowedPrefixes: ['apps/web/public/assets/textures/generated/'],
      }),
    ).toThrow(/outside allowed prefixes/i);
  });

  it('inspects real character GLB asset and rejects malformed GLB headers', () => {
    const report = inspectWorkspaceGlbAsset(
      REPO_ROOT,
      'apps/web/public/assets/models/characters/adventurer-male.glb',
    );
    expect(report.gltfVersion).toBe('2.0');
    expect(report.meshCount).toBeGreaterThan(0);
    expect(report.vertexCount).toBeGreaterThan(0);
    expect(Array.isArray(report.animationClips)).toBe(true);

    const syntheticJson = JSON.stringify({
      asset: { version: '2.0', generator: 'test' },
      animations: [{ name: 'idle_loop' }],
    });
    const paddedLen = Math.ceil(Buffer.byteLength(syntheticJson) / 4) * 4;
    const glbBuf = Buffer.alloc(20 + paddedLen, 0x20);
    glbBuf.writeUInt32LE(0x46546c67, 0);
    glbBuf.writeUInt32LE(2, 4);
    glbBuf.writeUInt32LE(glbBuf.byteLength, 8);
    glbBuf.writeUInt32LE(paddedLen, 12);
    glbBuf.writeUInt32LE(0x4e4f534a, 16);
    glbBuf.write(syntheticJson, 20, 'utf8');
    expect(inspectGlbBuffer('synthetic.glb', glbBuf).animationClips).toEqual(['idle_loop']);

    expect(() => inspectGlbBuffer('bad.glb', Buffer.from('not-a-glb-file'))).toThrow(
      /magic|small/i,
    );
  });

  it('audits real workspace textures and generates procedural SVG textures safely', () => {
    const audit = inspectTextureDirectory(REPO_ROOT, 'apps/web/public/assets/textures');
    expect(audit.totalFiles).toBeGreaterThanOrEqual(2);
    expect(audit.entries.some((entry) => entry.file.endsWith('metal-floco.webp'))).toBe(true);

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-mcp-tex-'));
    try {
      const generated = generateProceduralTextureAsset({
        repoRoot: tmpRoot,
        pattern: 'hex-holo',
        size: 256,
        primaryHex: '#38BDF8',
        secondaryHex: '#0F172A',
        outputRelativePath: 'apps/web/public/assets/textures/generated/holo-grid.svg',
      });
      expect(generated.powerOfTwo).toBe(true);
      expect(generated.writtenPath).toBe('apps/web/public/assets/textures/generated/holo-grid.svg');
      expect(generated.svg).toContain('<svg');
      expect(
        fs.existsSync(
          path.join(tmpRoot, 'apps/web/public/assets/textures/generated/holo-grid.svg'),
        ),
      ).toBe(true);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('simulates Havok physics presets, HUD contrast, character blueprint, and Babylon scaffold', () => {
    const capsule = simulatePhysicsPreset({
      entityKind: 'character-capsule',
      massKg: 72,
      gravityMps2: -9.81,
      jumpVelocityMps: 6.4,
      moveSpeedMps: 6.5,
      friction: 0.45,
      restitution: 0.05,
      linearDamping: 0.15,
      capsuleRadiusM: 0.35,
      capsuleHeightM: 1.75,
      stepHz: 60,
    });
    expect(capsule.recommendedHavokShape).toBe('CAPSULE');
    expect(capsule.jumpApexHeightM).toBeCloseTo(2.088, 2);
    expect(capsule.warnings).toEqual([]);

    const fastProjectile = simulatePhysicsPreset({
      entityKind: 'projectile',
      massKg: 0,
      gravityMps2: -9.81,
      jumpVelocityMps: 0,
      moveSpeedMps: 50,
      friction: 0.1,
      restitution: 0.95,
      linearDamping: 0.01,
      capsuleRadiusM: 0.1,
      capsuleHeightM: 0.2,
      stepHz: 60,
    });
    expect(fastProjectile.warnings.length).toBeGreaterThanOrEqual(3);

    const contrast = evaluateWcagContrast('#f1f5f9', '#0f172a');
    expect(contrast.passesAaNormalText).toBe(true);
    expect(contrast.contrastRatio).toBeGreaterThan(12);
    expect(readDesignTokens(REPO_ROOT).length).toBeGreaterThan(20);

    const blueprint = buildCharacterBlueprint({
      name: '  Kael  Norte ',
      originKey: 'highlands',
      bodyModel: 'male',
      presetKey: 'vanguard',
      trainSkills: ['mastery_excalibur', 'mastery_excalibur'],
    });
    expect(blueprint.name).toBe('Kael Norte');
    expect(blueprint.emergentArchetype.key).toBe('duelist');
    expect(blueprint.babylonRigContract.glbAssetPath).toContain('adventurer-male.glb');

    const scaffold = buildBabylonScaffold({
      moduleName: 'arena-stage',
      kind: 'character-controller',
      enableHavok: true,
      hardwareTier: 'ultra',
    });
    expect(scaffold.symbolName).toBe('mountArenaStageBabylonStage');
    expect(scaffold.code).toContain('HavokPlugin');
  });

  it('serves tools, resources, and prompts over MCP protocol via InMemoryTransport', async () => {
    const server = createPokeverseMcpServer(REPO_ROOT);
    const client = new Client({ name: 'vitest-mcp-client', version: '0.1.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          'inspect_glb_asset',
          'inspect_texture_assets',
          'generate_procedural_texture',
          'simulate_havok_physics',
          'scaffold_babylon_scene',
          'build_character_blueprint',
          'audit_hud_tokens_and_contrast',
          'run_workspace_check',
        ]),
      );

      const glbCall = await client.callTool({
        name: 'inspect_glb_asset',
        arguments: {
          relativePath: 'apps/web/public/assets/models/characters/adventurer-female.glb',
        },
      });
      expect(glbCall.isError).not.toBe(true);

      const strictReject = await client.callTool({
        name: 'simulate_havok_physics',
        arguments: { entityKind: 'dynamic-prop', unexpectedKey: true },
      });
      expect(strictReject.isError).toBe(true);

      const resources = await client.listResources();
      expect(resources.resources.length).toBeGreaterThanOrEqual(5);
      const tokensResource = await client.readResource({
        uri: 'pokeverse://devkit/design-tokens',
      });
      expect(tokensResource.contents[0]?.mimeType).toBe('application/json');

      const prompts = await client.listPrompts();
      expect(prompts.prompts.length).toBeGreaterThanOrEqual(3);
      const hudPrompt = await client.getPrompt({
        name: 'create-game-hud-from-figma',
        arguments: { featureName: 'minimap' },
      });
      expect(hudPrompt.messages[0]?.content.type).toBe('text');
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});
