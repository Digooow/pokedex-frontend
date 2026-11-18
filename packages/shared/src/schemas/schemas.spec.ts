import { describe, expect, it } from 'vitest';
import { PLATFORM_MODULES } from '../constants/platform.constants';
import {
  AuthSessionResponseSchema,
  LoginTrainerSchema,
  RegisterTrainerSchema,
  ResetPasswordOtpSchema,
  SessionBootstrapResponseSchema,
  VerifyEmailOtpSchema,
} from './auth.schemas';
import {
  EmailNotificationEventSchema,
  KAFKA_TOPICS,
  WorldTickerEventSchema,
} from './events.schemas';
import { ReadinessResponseSchema, SystemBootstrapSchema } from './health.schemas';
import { PokedexSlotRecordSchema, PokemonDetailSchema, SavePokedexSlotSchema } from './pokedex.schemas';

describe('shared schemas boundary validation', () => {
  it('validates strict SavePokedexSlotSchema bounds', () => {
    const valid = SavePokedexSlotSchema.safeParse({
      slotIndex: 0,
      pokemonId: 25,
      pokemonName: 'pikachu',
      nickname: 'Sparky',
      spriteUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
    });
    expect(valid.success).toBe(true);

    const outOfRange = SavePokedexSlotSchema.safeParse({
      slotIndex: 10,
      pokemonId: 0,
      pokemonName: '',
    });
    expect(outOfRange.success).toBe(false);

    const extraField = SavePokedexSlotSchema.safeParse({
      slotIndex: 1,
      pokemonId: 1,
      pokemonName: 'bulbasaur',
      evilOverride: true,
    });
    expect(extraField.success).toBe(false);
  });

  it('validates trainer registration, login, slots, and Kafka ticker events', () => {
    const reg = RegisterTrainerSchema.safeParse({
      username: 'Red_Kanto',
      email: 'RED@EXAMPLE.COM ',
      password: 'strong-password-123',
    });
    expect(reg.success).toBe(true);
    if (reg.success) {
      expect(reg.data.email).toBe('red@example.com');
    }

    const badPass = RegisterTrainerSchema.safeParse({
      username: 'a',
      email: 'bad',
      password: '123',
    });
    expect(badPass.success).toBe(false);

    expect(
      LoginTrainerSchema.safeParse({ email: 'red@example.com', password: 'secret' }).success,
    ).toBe(true);

    expect(
      PokedexSlotRecordSchema.safeParse({
        slotIndex: 9,
        pokemonId: 150,
        pokemonName: 'mewtwo',
        nickname: null,
        spriteUrl: null,
        updatedAt: new Date().toISOString(),
      }).success,
    ).toBe(true);

    expect(
      WorldTickerEventSchema.safeParse({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        eventType: 'pokedex.slot.saved',
        trainerId: '550e8400-e29b-41d4-a716-446655440001',
        username: 'Red_Kanto',
        summary: 'Red_Kanto registrou Pikachu (#0025) no Slot 1.',
        occurredAt: new Date().toISOString(),
        traceId: null,
      }).success,
    ).toBe(true);
    expect(KAFKA_TOPICS.WORLD_EVENTS).toBe('pokeverse.world.events.v1');
    expect(KAFKA_TOPICS.NOTIFICATIONS_EMAIL).toBe('pokeverse.notifications.email.v1');

    expect(
      VerifyEmailOtpSchema.safeParse({ email: 'RED@EXAMPLE.COM ', code: '123456' }).success,
    ).toBe(true);
    expect(
      VerifyEmailOtpSchema.safeParse({ email: 'red@example.com', code: '12ab56' }).success,
    ).toBe(false);
    expect(
      ResetPasswordOtpSchema.safeParse({
        email: 'red@example.com',
        code: '654321',
        newPassword: 'new-strong-password',
      }).success,
    ).toBe(true);

    const sessionRes = AuthSessionResponseSchema.safeParse({
      authenticated: true,
      sessionState: 'MFA_PENDING',
      mfaMethods: ['totp', 'backup_code'],
      expiresInSec: 900,
      trainer: {
        id: '550e8400-e29b-41d4-a716-446655440001',
        username: 'Red_Kanto',
        email: 'red@example.com',
        emailVerifiedAt: null,
        mfaEnabled: true,
        hasPassword: true,
        badgesCount: 0,
        eloRating: 1000,
        lastMapId: 'pokeverse-town',
        lastX: 400,
        lastY: 320,
        createdAt: new Date().toISOString(),
      },
    });
    expect(sessionRes.success).toBe(true);

    expect(
      SessionBootstrapResponseSchema.safeParse({ authenticated: false, canRefresh: false })
        .success,
    ).toBe(true);

    expect(
      EmailNotificationEventSchema.safeParse({
        eventId: '550e8400-e29b-41d4-a716-446655440002',
        template: 'email_verification_otp',
        toEmail: 'red@example.com',
        username: 'Red_Kanto',
        subject: 'Seu código de verificação PokéVerse',
        otpCode: '123456',
        requestedAt: new Date().toISOString(),
        traceId: null,
      }).success,
    ).toBe(true);
  });

  it('validates readiness and bootstrap contracts', () => {
    const ready = ReadinessResponseSchema.safeParse({
      status: 'ok',
      service: 'pokeverse-api',
      timestamp: new Date().toISOString(),
      uptimeSec: 1.5,
      dependencies: {
        postgres: { status: 'up', latencyMs: 3 },
        redis: { status: 'up', latencyMs: 1 },
        kafka: { status: 'up', latencyMs: 12 },
        s3: { status: 'up', latencyMs: 5 },
      },
    });
    expect(ready.success).toBe(true);

    const bootstrap = SystemBootstrapSchema.safeParse({
      service: 'pokeverse-api',
      phase: 'phase-1',
      timestamp: new Date().toISOString(),
      modules: [...PLATFORM_MODULES],
    });
    expect(bootstrap.success).toBe(true);
  });

  it('accepts sparse PokéAPI detail payloads safely', () => {
    const parsed = PokemonDetailSchema.safeParse({
      id: 25,
      name: 'pikachu',
      height: 4,
      weight: 60,
      base_experience: null,
      types: [{ slot: 1, type: { name: 'electric', url: 'https://pokeapi.co/api/v2/type/13/' } }],
      abilities: [],
      stats: [],
      sprites: { front_default: null, front_shiny: null },
    });
    expect(parsed.success).toBe(true);
  });
});
