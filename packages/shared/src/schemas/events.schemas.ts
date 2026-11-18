import { z } from 'zod';

export const KAFKA_TOPICS = {
  WORLD_EVENTS: 'pokeverse.world.events.v1',
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
