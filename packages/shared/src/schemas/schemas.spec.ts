import { describe, expect, it } from 'vitest';
import { PLATFORM_MODULES } from '../constants/platform.constants';
import {
  ActiveSessionsResponseSchema,
  AuthSessionResponseSchema,
  DisableTotpSchema,
  GoogleOAuthCallbackQuerySchema,
  LoginTrainerSchema,
  MfaChallengeVerifySchema,
  PRIVACY_CONSENT_VERSION,
  PasskeyIdParamSchema,
  PrivacyConsentSchema,
  RegisterTrainerSchema,
  ResetPasswordOtpSchema,
  RevokeOtherSessionsResponseSchema,
  SessionBootstrapResponseSchema,
  TotpEnableResponseSchema,
  TrainerDataExportSchema,
  VerifyEmailOtpSchema,
} from './auth.schemas';
import {
  EmailNotificationEventSchema,
  KAFKA_TOPICS,
  WorldTickerEventSchema,
} from './events.schemas';
import { ReadinessResponseSchema, SystemBootstrapSchema } from './health.schemas';
import {
  PokedexSlotIndexParamSchema,
  PokedexSlotRecordSchema,
  PokemonDetailSchema,
  PokemonIdentifierParamSchema,
  SavePokedexSlotSchema,
} from './pokedex.schemas';

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
      SessionBootstrapResponseSchema.safeParse({ authenticated: false, canRefresh: false }).success,
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

    expect(MfaChallengeVerifySchema.safeParse({ method: 'totp', code: '123456' }).success).toBe(
      true,
    );
    expect(
      MfaChallengeVerifySchema.safeParse({ method: 'backup_code', code: 'ABCD-EFGH' }).success,
    ).toBe(true);
    expect(DisableTotpSchema.safeParse({}).success).toBe(false);
    expect(
      TotpEnableResponseSchema.safeParse({
        message: '2FA ativado',
        backupCodes: [
          'A1B2-C3D4',
          'E5F6-G7H8',
          'J1K2-M3N4',
          'P5Q6-R7S8',
          'T1U2-V3W4',
          'X5Y6-Z7A8',
          'B1C2-D3E4',
          'F5G6-H7J8',
        ],
      }).success,
    ).toBe(true);

    expect(
      PrivacyConsentSchema.safeParse({
        version: PRIVACY_CONSENT_VERSION,
        essential: true,
        functionalPreferences: true,
        optionalTelemetry: false,
        updatedAt: new Date().toISOString(),
      }).success,
    ).toBe(true);

    expect(
      PrivacyConsentSchema.safeParse({
        version: PRIVACY_CONSENT_VERSION,
        essential: false,
        functionalPreferences: true,
        optionalTelemetry: false,
        updatedAt: new Date().toISOString(),
      }).success,
    ).toBe(false);

    expect(
      ActiveSessionsResponseSchema.safeParse({
        sessions: [
          {
            familyId: '550e8400-e29b-41d4-a716-446655440099',
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            isCurrent: true,
          },
        ],
      }).success,
    ).toBe(true);

    expect(
      RevokeOtherSessionsResponseSchema.safeParse({
        revokedCount: 2,
        message: 'Outras sessões encerradas.',
      }).success,
    ).toBe(true);

    expect(
      TrainerDataExportSchema.safeParse({
        exportedAt: new Date().toISOString(),
        trainer: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          username: 'Red_Kanto',
          email: 'red@example.com',
          emailVerifiedAt: null,
          mfaEnabled: false,
          hasPassword: true,
          badgesCount: 0,
          eloRating: 1000,
          lastMapId: 'pokeverse-town',
          lastX: 400,
          lastY: 320,
          createdAt: new Date().toISOString(),
        },
        oauthProviders: [
          {
            provider: 'google',
            email: 'red@example.com',
            linkedAt: new Date().toISOString(),
          },
        ],
        passkeys: [],
        pokedexSlots: [],
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

  it('validates PokedexSlotIndexParamSchema and PokemonIdentifierParamSchema boundaries', () => {
    expect(PokedexSlotIndexParamSchema.parse('0')).toBe(0);
    expect(PokedexSlotIndexParamSchema.parse('9')).toBe(9);
    expect(PokedexSlotIndexParamSchema.parse(0)).toBe(0);
    expect(PokedexSlotIndexParamSchema.parse(9)).toBe(9);

    for (const invalidIndex of ['-1', '10', '1.5', 'abc', '', ' 2 ', -1, 10, 1.5]) {
      expect(PokedexSlotIndexParamSchema.safeParse(invalidIndex).success).toBe(false);
    }

    expect(PokemonIdentifierParamSchema.parse('Pikachu')).toBe('pikachu');
    expect(PokemonIdentifierParamSchema.parse(' 25 ')).toBe('25');
    expect(PokemonIdentifierParamSchema.parse('mr-mime')).toBe('mr-mime');

    for (const invalidIdentifier of ['../etc/passwd', '   ', '', 'a'.repeat(65), 'pikachu!']) {
      expect(PokemonIdentifierParamSchema.safeParse(invalidIdentifier).success).toBe(false);
    }
  });

  it('validates GoogleOAuthCallbackQuerySchema and PasskeyIdParamSchema boundaries', () => {
    const callbackParsed = GoogleOAuthCallbackQuerySchema.parse({
      code: '4/0A-valid',
      state: 'abc_123-XYZ',
      scope: 'openid email',
      authuser: '0',
      prompt: 'consent',
    });
    expect(callbackParsed).toEqual({ code: '4/0A-valid', state: 'abc_123-XYZ' });
    expect('scope' in callbackParsed).toBe(false);
    expect('authuser' in callbackParsed).toBe(false);
    expect('prompt' in callbackParsed).toBe(false);

    expect(
      GoogleOAuthCallbackQuerySchema.parse({
        error: 'access_denied',
        state: 'abc_123',
      }),
    ).toEqual({ error: 'access_denied', state: 'abc_123' });
    expect(GoogleOAuthCallbackQuerySchema.parse({})).toEqual({});

    for (const invalidQuery of [
      { code: '' },
      { code: 'a'.repeat(2049) },
      { code: ['a', 'b'] },
      { state: 'invalid!state' },
      { state: '../etc' },
      { error: '' },
    ]) {
      expect(GoogleOAuthCallbackQuerySchema.safeParse(invalidQuery).success).toBe(false);
    }

    expect(PasskeyIdParamSchema.parse('550e8400-e29b-41d4-a716-446655440055')).toBe(
      '550e8400-e29b-41d4-a716-446655440055',
    );
    for (const invalidId of ['not-a-uuid', '', '123']) {
      expect(PasskeyIdParamSchema.safeParse(invalidId).success).toBe(false);
    }
  });
});
