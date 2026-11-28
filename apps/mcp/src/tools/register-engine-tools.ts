import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CHARACTER_BODY_MODELS, CHARACTER_ORIGIN_KEYS } from '@pokeverse/shared';
import { z } from 'zod';
import { buildBabylonScaffold } from '../services/babylon-scaffold.service.js';
import { buildCharacterBlueprint } from '../services/character-blueprint.service.js';
import {
  evaluateWcagContrast,
  readDesignTokens,
  readWebBudgets,
} from '../services/hud-devkit.service.js';
import { simulatePhysicsPreset } from '../services/physics-preset.service.js';
import {
  ALLOWED_WORKSPACE_CHECKS,
  runAllowlistedWorkspaceCheck,
} from '../services/workspace-runner.service.js';
import { runAsyncTool, runSyncTool } from './tool-response.util.js';

const PhysicsPresetSchema = z
  .object({
    entityKind: z
      .enum([
        'character-capsule',
        'dynamic-prop',
        'projectile',
        'vehicle-chassis',
        'static-terrain',
      ])
      .default('character-capsule'),
    massKg: z.number().min(0).max(50_000).default(72),
    gravityMps2: z.number().min(-50).max(-0.1).default(-9.81),
    jumpVelocityMps: z.number().min(0).max(50).default(6.4),
    moveSpeedMps: z.number().min(0).max(120).default(6.5),
    friction: z.number().min(0).max(2).default(0.45),
    restitution: z.number().min(0).max(1).default(0.05),
    linearDamping: z.number().min(0).max(10).default(0.15),
    capsuleRadiusM: z.number().min(0.1).max(5).default(0.35),
    capsuleHeightM: z.number().min(0.2).max(10).default(1.75),
    stepHz: z.union([z.literal(60), z.literal(120)]).default(60),
  })
  .strict();

const BabylonScaffoldSchema = z
  .object({
    moduleName: z.string().min(2).max(60),
    kind: z
      .enum(['character-controller', 'hud-overlay-bridge', 'pbr-stage-prop', 'hologram-shader'])
      .default('character-controller'),
    enableHavok: z.boolean().default(true),
    hardwareTier: z.enum(['ultra', 'balanced', 'lite']).default('balanced'),
  })
  .strict();

const CharacterBlueprintSchema = z
  .object({
    name: z.string().min(3).max(24),
    originKey: z.enum(CHARACTER_ORIGIN_KEYS).default('settler'),
    bodyModel: z.enum(CHARACTER_BODY_MODELS).default('male'),
    presetKey: z.enum(['balanced', 'vanguard', 'arcanist']).default('balanced'),
    trainSkills: z.array(z.string().min(1)).max(30).optional(),
  })
  .strict();

const HudAuditSchema = z
  .object({
    foregroundHex: z.string().default('#f1f5f9'),
    backgroundHex: z.string().default('#0f172a'),
    tokenFilter: z.string().optional(),
  })
  .strict();

const WorkspaceCheckSchema = z
  .object({
    check: z.enum(ALLOWED_WORKSPACE_CHECKS),
  })
  .strict();

function registerSimulationTools(server: McpServer): void {
  server.registerTool(
    'simulate_havok_physics',
    {
      title: 'Simulate Babylon.js + Havok Physics Preset',
      description:
        'Compute jump apex, air time, kinetic energy, stability warnings, and a ready-to-paste @babylonjs/havok PhysicsAggregate snippet.',
      inputSchema: PhysicsPresetSchema,
      annotations: { readOnlyHint: true },
    },
    (args) => runSyncTool(() => simulatePhysicsPreset(args)),
  );

  server.registerTool(
    'scaffold_babylon_scene',
    {
      title: 'Scaffold Babylon.js + Havok Stage',
      description:
        'Generate a tree-shaken Babylon.js + Havok TypeScript stage skeleton aligned with Angular lazy loading and self-hosted WASM/Draco CSP.',
      inputSchema: BabylonScaffoldSchema,
      annotations: { readOnlyHint: true },
    },
    (args) => runSyncTool(() => buildBabylonScaffold(args)),
  );

  server.registerTool(
    'build_character_blueprint',
    {
      title: 'Build Playable Character Blueprint',
      description:
        'Create and simulate a classless character sheet (attributes, vitals, emergent archetype, cascade skill training, and Babylon/Havok rig binding) using @pokeverse/shared.',
      inputSchema: CharacterBlueprintSchema,
      annotations: { readOnlyHint: true },
    },
    (args) => runSyncTool(() => buildCharacterBlueprint(args)),
  );
}

function registerHudAndWorkspaceTools(server: McpServer, repoRoot: string): void {
  server.registerTool(
    'audit_hud_tokens_and_contrast',
    {
      title: 'Audit HUD Tokens, Contrast & Budgets',
      description:
        'Check WCAG 2.2 AA/AAA contrast between foreground/background hex colors, filter --pv-* design tokens, and verify Angular HUD bundle/component size limits.',
      inputSchema: HudAuditSchema,
      annotations: { readOnlyHint: true },
    },
    (args) =>
      runSyncTool(() => {
        const filter = args.tokenFilter?.trim().toLowerCase();
        const tokens = readDesignTokens(repoRoot);
        const matchingTokens = filter
          ? tokens.filter((item) => item.name.toLowerCase().includes(filter))
          : tokens.slice(0, 40);
        return {
          contrast: evaluateWcagContrast(args.foregroundHex, args.backgroundHex),
          totalTokens: tokens.length,
          matchingTokens,
          webBudgets: readWebBudgets(repoRoot),
        };
      }),
  );

  server.registerTool(
    'run_workspace_check',
    {
      title: 'Run Allowlisted Workspace Check',
      description:
        'Execute an allowlisted verification script (typecheck, lint, audit:duplication, test:quality-gates, unit tests, or build) and return bounded output.',
      inputSchema: WorkspaceCheckSchema,
    },
    (args) => runAsyncTool(() => runAllowlistedWorkspaceCheck(repoRoot, args.check)),
  );
}

export function registerEngineTools(server: McpServer, repoRoot: string): void {
  registerSimulationTools(server);
  registerHudAndWorkspaceTools(server, repoRoot);
}
