import { z } from 'zod';

export const DependencyStatusSchema = z.object({
  status: z.enum(['up', 'down']),
  latencyMs: z.number().int().nonnegative(),
  detail: z.string().optional(),
});

export type DependencyStatus = z.infer<typeof DependencyStatusSchema>;

export const LivenessResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string().min(1),
  timestamp: z.string().datetime(),
  uptimeSec: z.number().nonnegative(),
});

export type LivenessResponse = z.infer<typeof LivenessResponseSchema>;

export const ReadinessResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.string().min(1),
  timestamp: z.string().datetime(),
  uptimeSec: z.number().nonnegative(),
  dependencies: z.object({
    postgres: DependencyStatusSchema,
    redis: DependencyStatusSchema,
    kafka: DependencyStatusSchema,
    s3: DependencyStatusSchema,
  }),
});

export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;

export const PlatformModuleSchema = z.object({
  id: z.enum(['overworld', 'pokedex', 'museum', 'arcade', 'arena']),
  label: z.string().min(1),
  route: z.string().startsWith('/'),
  shortcut: z.enum(['1', '2', '3', '4', '5']),
  requiresTrainer: z.boolean(),
  summary: z.string().min(1),
});

export const SystemBootstrapSchema = z.object({
  service: z.string().min(1),
  phase: z.literal('phase-1'),
  timestamp: z.string().datetime(),
  modules: z.array(PlatformModuleSchema),
});

export type SystemBootstrap = z.infer<typeof SystemBootstrapSchema>;
