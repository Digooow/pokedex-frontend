import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { inspectWorkspaceGlbAsset } from '../services/glb-inspector.service.js';
import {
  generateProceduralTextureAsset,
  inspectTextureDirectory,
} from '../services/texture-toolkit.service.js';
import { runSyncTool } from './tool-response.util.js';

const InspectGlbSchema = z
  .object({
    relativePath: z
      .string()
      .min(1)
      .describe(
        'Repository-relative path to a .glb file, e.g. apps/web/public/assets/models/characters/adventurer-male.glb.',
      ),
  })
  .strict();

const InspectTexturesSchema = z
  .object({
    relativeDir: z
      .string()
      .min(1)
      .default('apps/web/public/assets')
      .describe('Repository-relative directory to scan for texture files.'),
  })
  .strict();

const GenerateTextureSchema = z
  .object({
    pattern: z
      .enum(['grid', 'hex-holo', 'metal-brushed', 'scanline-hud', 'checker-uv'])
      .describe('Procedural pattern template.'),
    size: z
      .number()
      .int()
      .min(64)
      .max(2048)
      .default(512)
      .describe('Square texture dimension in pixels (power of two recommended, 64..2048).'),
    primaryHex: z.string().default('#38bdf8').describe('Primary #RRGGBB hex color.'),
    secondaryHex: z.string().default('#0f172a').describe('Secondary #RRGGBB hex color.'),
    outputRelativePath: z
      .string()
      .min(1)
      .optional()
      .describe('Optional .svg destination under apps/web/public/assets/textures/generated/.'),
  })
  .strict();

export function registerAssetTools(server: McpServer, repoRoot: string): void {
  server.registerTool(
    'inspect_glb_asset',
    {
      title: 'Inspect GLB 3D Asset',
      description:
        'Parse a GLB 2.0 binary asset in the workspace and report meshes, triangles, materials, Draco/KTX2 compression, skeleton joints, animations, and mobile WebGL budget status.',
      inputSchema: InspectGlbSchema,
      annotations: { readOnlyHint: true },
    },
    (args) => runSyncTool(() => inspectWorkspaceGlbAsset(repoRoot, args.relativePath)),
  );

  server.registerTool(
    'inspect_texture_assets',
    {
      title: 'Audit Workspace Textures',
      description:
        'Scan texture assets (.webp, .png, .jpg, .svg, .ktx2) under a workspace directory, reading dimensions, power-of-two alignment, and mobile VRAM/file-size warnings.',
      inputSchema: InspectTexturesSchema,
      annotations: { readOnlyHint: true },
    },
    (args) => runSyncTool(() => inspectTextureDirectory(repoRoot, args.relativeDir)),
  );

  server.registerTool(
    'generate_procedural_texture',
    {
      title: 'Generate Procedural Texture SVG',
      description:
        'Generate deterministic procedural SVG textures (grid, hex-holo, metal-brushed, scanline-hud, checker-uv) for Babylon.js materials or HUD layers, optionally saving under apps/web/public/assets/textures/generated/.',
      inputSchema: GenerateTextureSchema,
    },
    (args) =>
      runSyncTool(() =>
        generateProceduralTextureAsset({
          repoRoot,
          pattern: args.pattern,
          size: args.size,
          primaryHex: args.primaryHex,
          secondaryHex: args.secondaryHex,
          outputRelativePath: args.outputRelativePath,
        }),
      ),
  );
}
