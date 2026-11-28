import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

interface PromptSpec {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly argsSchema: Record<string, z.ZodString>;
  readonly renderText: (args: Record<string, string | undefined>) => string;
}

const PROMPT_SPECS: readonly PromptSpec[] = [
  {
    name: 'create-game-hud-from-figma',
    title: 'Create Game HUD from Figma',
    description: 'Plan and implement a responsive, WCAG AA Angular HUD overlay from Figma tokens.',
    argsSchema: {
      featureName: z.string().describe('HUD feature name (e.g. inventory, minimap, stamina-bar).'),
    },
    renderText: (args) =>
      [
        `Design and implement the "${args['featureName'] ?? 'hud'}" Angular overlay component for the Babylon.js game canvas:`,
        '1. Read pokeverse://devkit/design-tokens and reuse --pv-* semantic tokens (zero hardcoded hex/rgb).',
        '2. Verify foreground/background contrast >= 4.5:1 using audit_hud_tokens_and_contrast.',
        '3. Keep component TS <= 200 lines, use OnPush + Signals, and keep Babylon render loops outside Angular change detection.',
        '4. Support prefers-reduced-motion: reduce and mobile 375px + desktop 1440px viewports.',
      ].join('\n'),
  },
  {
    name: 'design-babylon-character-and-physics',
    title: 'Design Blender Character & Havok Controller',
    description: 'End-to-end Blender -> GLB -> Babylon.js + Havok capsule physics workflow.',
    argsSchema: {
      characterName: z.string().describe('Character name or archetype.'),
    },
    renderText: (args) =>
      [
        `Prepare 3D character "${args['characterName'] ?? 'adventurer'}" from Blender into Babylon.js + Havok:`,
        '1. In Blender (via mcp-for-blender), verify humanoid scale in meters (~1.75m height), apply transforms, keep <= 64 bones, and export GLB 2.0 with Draco + WebP textures.',
        '2. Run inspect_glb_asset to verify triangle budget, animations, and Draco/VRAM compliance.',
        '3. Run build_character_blueprint and simulate_havok_physics (character-capsule) for Havok PhysicsAggregate parameters.',
        '4. Scaffold the Babylon.js stage using scaffold_babylon_scene with self-hosted /assets/draco/ and /assets/havok/.',
      ].join('\n'),
  },
  {
    name: 'create-pbr-texture-pack',
    title: 'Create PBR Texture Pack',
    description: 'Generate or audit power-of-two textures and Babylon.js material bindings.',
    argsSchema: {
      surfaceName: z.string().describe('Surface or biome name (e.g. stone-ruins, cyber-panel).'),
    },
    renderText: (args) =>
      [
        `Build a web-optimized texture pack for "${args['surfaceName'] ?? 'surface'}":`,
        '1. Inspect existing textures via inspect_texture_assets to check power-of-two and VRAM budgets.',
        '2. Generate procedural helper overlays via generate_procedural_texture or bake PBR maps in Blender (Albedo, Normal, Roughness/Metallic).',
        '3. Target WebP or KTX2 <= 512 KB per map and verify Babylon PBRMaterial bindings.',
      ].join('\n'),
  },
];

export function registerDevkitPrompts(server: McpServer): void {
  for (const spec of PROMPT_SPECS) {
    server.registerPrompt(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        argsSchema: spec.argsSchema,
      },
      (args) => ({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: spec.renderText(args),
            },
          },
        ],
      }),
    );
  }
}
