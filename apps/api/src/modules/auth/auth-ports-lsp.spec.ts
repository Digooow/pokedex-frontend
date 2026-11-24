import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EmailNotificationEvent } from '@pokeverse/shared';
import { CryptoService } from '../../common/security/crypto.service';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import type {
  EmailTransport,
  OutboundEmailMessage,
} from '../notifications/email-transport.port';
import { MailService } from '../notifications/mail.service';
import { SmtpEmailTransport } from '../notifications/smtp-email.transport';
import type { OtpStore, SessionRepository } from './auth-storage.ports';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';

class InMemoryAtomicAuthStore implements SessionRepository, OtpStore {
  private readonly kv = new Map<
    string,
    { value: string; expiresAtMs: number }
  >();
  private readonly sets = new Map<string, Set<string>>();

  getString(key: string): Promise<string | null> {
    const entry = this.kv.get(key);
    if (!entry) return Promise.resolve(null);
    if (Date.now() > entry.expiresAtMs) {
      this.kv.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.getString(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  setJsonEx(key: string, ttlSeconds: number, value: unknown): Promise<void> {
    this.kv.set(key, {
      value: JSON.stringify(value),
      expiresAtMs: Date.now() + ttlSeconds * 1000,
    });
    return Promise.resolve();
  }

  delKeys(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      if (this.kv.delete(key)) removed += 1;
      if (this.sets.delete(key)) removed += 1;
    }
    return Promise.resolve(removed);
  }

  addToSetWithTtl(key: string, member: string): Promise<void> {
    const current = this.sets.get(key) ?? new Set<string>();
    current.add(member);
    this.sets.set(key, current);
    return Promise.resolve();
  }

  getSetMembers(key: string): Promise<string[]> {
    return Promise.resolve(Array.from(this.sets.get(key) ?? []));
  }

  removeSetMembers(key: string, ...members: string[]): Promise<void> {
    const current = this.sets.get(key);
    if (current) {
      for (const m of members) current.delete(m);
    }
    return Promise.resolve();
  }

  incrementCounterWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const existing = this.kv.get(key);
    const activeValue =
      existing && Date.now() <= existing.expiresAtMs ? existing.value : '0';
    const current = Number(activeValue) + 1;
    this.kv.set(key, {
      value: String(current),
      expiresAtMs: Date.now() + ttlSeconds * 1000,
    });
    return Promise.resolve(current);
  }
}

function createAuthConfigMock(
  overrides: Partial<Record<keyof ApiEnvConfig, unknown>> = {},
): ConfigService<ApiEnvConfig, true> {
  const defaults: Record<string, unknown> = {
    APP_ENCRYPTION_KEY:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    SESSION_TTL_SEC: 900,
    REFRESH_TTL_DAYS: 7,
    OTP_TTL_SEC: 600,
    OTP_MAX_ATTEMPTS: 3,
    COOKIE_SECURE: false,
    COOKIE_SAMESITE: 'lax',
    COOKIE_DOMAIN: '',
    MAIL_TRANSPORT: 'resend',
    MAIL_FROM: 'PokéVerse OS <no-reply@pokeverse.local>',
    ...overrides,
  };
  return {
    get: (key: keyof ApiEnvConfig) => defaults[key],
  } as unknown as ConfigService<ApiEnvConfig, true>;
}

describe('DIP Ports & LSP Substitution Invariants (OtpStore, SessionRepository, EmailTransport)', () => {
  it('enforces single-use consumption and concurrent attempt lockout in OtpService over any OtpStore', async () => {
    const store = new InMemoryAtomicAuthStore();
    const config = createAuthConfigMock();
    const crypto = new CryptoService(config);
    const otpService = new OtpService(store, crypto, config);

    const issued = await otpService.issueOtp('verify', 'ash@pokeverse.local');
    const results = await Promise.all([
      otpService.verifyAndConsumeOtp('verify', 'ash@pokeverse.local', '000001'),
      otpService.verifyAndConsumeOtp('verify', 'ash@pokeverse.local', '000002'),
      otpService.verifyAndConsumeOtp('verify', 'ash@pokeverse.local', '000003'),
    ]);

    expect(results).toEqual([false, false, false]);
    expect(
      await otpService.verifyAndConsumeOtp(
        'verify',
        'ash@pokeverse.local',
        issued.code,
      ),
    ).toBe(false);
  });

  it('rotates sidHash on MFA promotion and selectively revokes sibling families in SessionService', async () => {
    const store = new InMemoryAtomicAuthStore();
    const config = createAuthConfigMock();
    const crypto = new CryptoService(config);
    const sessionService = new SessionService(store, crypto, config);

    const pending = await sessionService.createSession({
      trainerId: 'tr-1',
      username: 'Ash',
      role: 'ADMIN',
      familyId: 'fam-a',
      state: 'MFA_PENDING',
      mfaMethods: ['totp'],
    });
    const sibling = await sessionService.createSession({
      trainerId: 'tr-1',
      username: 'Ash',
      role: 'ADMIN',
      familyId: 'fam-b',
      state: 'AUTHENTICATED',
      mfaMethods: [],
    });

    const promoted = await sessionService.promoteToAuthenticated(
      pending.rawSid,
    );
    expect(promoted?.rawSid).toBeTruthy();
    expect(promoted?.rawSid).not.toBe(pending.rawSid);
    expect(promoted?.state).toBe('AUTHENTICATED');
    expect(await sessionService.getSessionByRawSid(pending.rawSid)).toBeNull();
    expect(
      await sessionService.getSessionByRawSid(promoted?.rawSid),
    ).toMatchObject({ role: 'ADMIN', familyId: 'fam-a' });

    const revokedCount = await sessionService.revokeOtherSessionsForTrainer(
      'tr-1',
      'fam-a',
    );
    expect(revokedCount).toBe(1);
    expect(await sessionService.getSessionByRawSid(sibling.rawSid)).toBeNull();
    expect(
      await sessionService.getSessionByRawSid(promoted?.rawSid),
    ).not.toBeNull();
  });

  it('dispatches rendered email via injected EmailTransport port and preserves SMTP guard error', async () => {
    const sent: OutboundEmailMessage[] = [];
    const fakeTransport: EmailTransport = {
      mode: 'smtp',
      send: (message) => {
        sent.push(message);
        return Promise.resolve();
      },
    };
    const config = createAuthConfigMock();
    const mailService = new MailService(
      config,
      new StructuredLoggerService(),
      fakeTransport,
    );

    const event: EmailNotificationEvent = {
      eventId: '11111111-1111-4111-8111-111111111111',
      template: 'welcome',
      toEmail: 'misty@pokeverse.local',
      username: 'Misty <Water>',
      subject: 'Bem-vinda!',
      traceId: 'a'.repeat(32),
      requestedAt: new Date().toISOString(),
    };

    await mailService.sendNotification(event);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.html).toContain('Misty &lt;Water&gt;');

    const uninitializedSmtp = new SmtpEmailTransport(config);
    await expect(uninitializedSmtp.send(sent[0]!)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
