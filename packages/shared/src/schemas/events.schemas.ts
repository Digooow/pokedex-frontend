import { z } from 'zod';

export const KAFKA_TOPICS = {
  WORLD_EVENTS: 'pokeverse.world.events.v1',
  NOTIFICATIONS_EMAIL: 'pokeverse.notifications.email.v1',
  ARCADE_SAVESTATE: 'pokeverse.arcade.savestate.v1',
  BATTLE_MATCHMAKING: 'pokeverse.battle.matchmaking.v1',
  BATTLE_RESULTS: 'pokeverse.battle.results.v1',
  DLQ: 'pokeverse.dlq.v1',
} as const;

export const WorldEventTypeSchema = z.enum([
  'trainer.registered',
  'pokedex.slot.saved',
  'pokedex.slot.cleared',
]);

export type WorldEventType = z.infer<typeof WorldEventTypeSchema>;

export const WorldTickerEventSchema = z.object({
  eventId: z.uuid(),
  eventType: WorldEventTypeSchema,
  trainerId: z.uuid(),
  username: z.string().min(1).max(32),
  summary: z.string().min(1).max(200),
  occurredAt: z.iso.datetime(),
  traceId: z.string().nullable(),
});

export type WorldTickerEvent = z.infer<typeof WorldTickerEventSchema>;

export const EmailNotificationTemplateSchema = z.enum([
  'welcome',
  'email_verification_otp',
  'password_reset_otp',
  'security_alert',
]);

export type EmailNotificationTemplate = z.infer<typeof EmailNotificationTemplateSchema>;

export const EmailNotificationEventSchema = z.object({
  eventId: z.uuid(),
  template: EmailNotificationTemplateSchema,
  toEmail: z.email(),
  username: z.string().min(1).max(32),
  subject: z.string().min(1).max(160),
  otpCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  detail: z.string().max(400).optional(),
  requestedAt: z.iso.datetime(),
  traceId: z.string().nullable(),
});

export type EmailNotificationEvent = z.infer<typeof EmailNotificationEventSchema>;

export const EncryptedOutboxPayloadSchema = z.object({
  version: z.literal(1),
  ciphertext: z.string().min(1),
});

export type EncryptedOutboxPayload = z.infer<typeof EncryptedOutboxPayloadSchema>;
