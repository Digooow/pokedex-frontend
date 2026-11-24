import * as z from 'zod';

export const WebVitalMetricNameSchema = z.enum(['LCP', 'CLS', 'INP', 'FCP', 'TTFB', 'LONG_TASK']);

export type WebVitalMetricName = z.infer<typeof WebVitalMetricNameSchema>;

export const HardwareTierLabelSchema = z.enum(['ULTRA', 'BALANCED', 'LITE']);

export type HardwareTierLabel = z.infer<typeof HardwareTierLabelSchema>;

export const ClientRumSampleSchema = z
  .object({
    name: WebVitalMetricNameSchema,
    value: z.number().nonnegative().max(120_000),
    route: z.string().min(1).max(120).startsWith('/'),
    tier: HardwareTierLabelSchema,
  })
  .strict();

export type ClientRumSample = z.infer<typeof ClientRumSampleSchema>;

export const ClientRumBatchSchema = z
  .object({
    samples: z.array(ClientRumSampleSchema).min(1).max(20),
    traceId: z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .optional(),
  })
  .strict();

export type ClientRumBatch = z.infer<typeof ClientRumBatchSchema>;

export const ClientErrorReportSchema = z
  .object({
    message: z.string().min(1).max(500),
    name: z.string().min(1).max(120).default('Error'),
    route: z.string().min(1).max(120).startsWith('/'),
    stack: z.string().max(4000).optional(),
    tier: HardwareTierLabelSchema.optional(),
    traceId: z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .optional(),
  })
  .strict();

export type ClientErrorReport = z.infer<typeof ClientErrorReportSchema>;

export const TelemetryIngestAckSchema = z.object({
  accepted: z.literal(true),
  count: z.number().int().nonnegative(),
  correlationId: z.string().nullable(),
});

export type TelemetryIngestAck = z.infer<typeof TelemetryIngestAckSchema>;
