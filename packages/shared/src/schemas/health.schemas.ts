import * as z from 'zod';

export const DependencyStatusSchema = z.object({
  status: z.enum(['up', 'down']),
  latencyMs: z.number().int().nonnegative(),
  detail: z.string().optional(),
});

export type DependencyStatus = z.infer<typeof DependencyStatusSchema>;

export const LivenessResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string().min(1),
  timestamp: z.iso.datetime(),
  uptimeSec: z.number().nonnegative(),
});

export type LivenessResponse = z.infer<typeof LivenessResponseSchema>;

export const ReadinessResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.string().min(1),
  timestamp: z.iso.datetime(),
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
  id: z.enum(['overworld', 'pokedex', 'arcade', 'arena']),
  label: z.string().min(1),
  route: z.string().startsWith('/'),
  shortcut: z.enum(['1', '2', '3', '4']),
  requiresTrainer: z.boolean(),
  summary: z.string().min(1),
});

export const SystemBootstrapSchema = z.object({
  service: z.string().min(1),
  phase: z.enum([
    'phase-1',
    'phase-2',
    'phase-2a',
    'phase-2b',
    'phase-3',
    'phase-4',
    'phase-4a',
    'phase-4b',
    'phase-5',
    'phase-6',
  ]),
  timestamp: z.iso.datetime(),
  modules: z.array(PlatformModuleSchema),
});

export type SystemBootstrap = z.infer<typeof SystemBootstrapSchema>;

export const TelemetrySnapshotSchema = z.object({
  service: z.literal('pokeverse-api'),
  otelSdkActive: z.boolean(),
  generatedAt: z.iso.datetime(),
  http: z.object({
    totalRequests: z.number().int().nonnegative(),
    error5xxCount: z.number().int().nonnegative(),
    errorRate5xx: z.number().nonnegative(),
    latencyMs: z.object({
      p50: z.number().nonnegative(),
      p95: z.number().nonnegative(),
      p99: z.number().nonnegative(),
    }),
  }),
  redisCache: z.object({
    hits: z.number().int().nonnegative(),
    misses: z.number().int().nonnegative(),
    staleFallbacks: z.number().int().nonnegative(),
    hitRatio: z.number().min(0).max(1),
  }),
  database: z.object({
    queryCount: z.number().int().nonnegative(),
    p95DurationMs: z.number().nonnegative(),
  }),
  messaging: z.object({
    publishedCount: z.number().int().nonnegative(),
    consumedCount: z.number().int().nonnegative(),
    dlqCount: z.number().int().nonnegative(),
  }),
  websocket: z.object({
    activeConnections: z.number().int().nonnegative(),
    broadcastCount: z.number().int().nonnegative(),
  }),
  observability: z.object({
    otelLogsActive: z.boolean(),
    sentryEnabled: z.boolean(),
    unhandledApiErrors: z.number().int().nonnegative(),
    clientUiErrors: z.number().int().nonnegative(),
    rumSamplesCount: z.number().int().nonnegative(),
  }),
});

export type TelemetrySnapshot = z.infer<typeof TelemetrySnapshotSchema>;
