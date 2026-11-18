import { ConfigService } from '@nestjs/config';
import { EncryptedOutboxPayloadSchema } from '@pokeverse/shared';
import { CryptoService } from '../../common/security/crypto.service';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import { KafkaService } from '../../infra/kafka.service';
import { RedisService } from '../../infra/redis.service';
import { MailService } from '../notifications/mail.service';
import { EmailNotificationsConsumerService } from './email-notifications.consumer';

describe('EmailNotificationsConsumerService', () => {
  it('decrypts encrypted email envelopes idempotently and redacts broken messages into DLQ', async () => {
    const configMock = {
      get: jest.fn((key: keyof ApiEnvConfig) =>
        key === 'APP_ENCRYPTION_KEY'
          ? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
          : 'smtp',
      ),
    } as unknown as ConfigService<ApiEnvConfig, true>;

    const crypto = new CryptoService(configMock);
    const seenIds = new Set<string>();
    const acquireIdempotencyLock = jest.fn(
      (_group: string, eventId: string) => {
        if (seenIds.has(eventId)) {
          return Promise.resolve(false);
        }
        seenIds.add(eventId);
        return Promise.resolve(true);
      },
    );

    const publishDlq = jest.fn().mockResolvedValue(undefined);
    const sendNotification = jest.fn().mockResolvedValue(undefined);

    const consumer = new EmailNotificationsConsumerService(
      { publishDlq } as unknown as KafkaService,
      { acquireIdempotencyLock } as unknown as RedisService,
      crypto,
      { sendNotification } as unknown as MailService,
      configMock,
      new StructuredLoggerService(),
    );

    const encryptedEnvelope = JSON.stringify(
      EncryptedOutboxPayloadSchema.parse({
        version: 1,
        ciphertext: crypto.encryptJson({
          eventId: '550e8400-e29b-41d4-a716-446655440010',
          template: 'password_reset_otp',
          toEmail: 'red@example.com',
          username: 'Red_Kanto',
          subject: 'Recuperação',
          otpCode: '123456',
          requestedAt: new Date().toISOString(),
          traceId: null,
        }),
      }),
    );

    expect(
      await consumer.handleRawMessage(
        'pokeverse.notifications.email.v1',
        encryptedEnvelope,
      ),
    ).toBe('processed');
    expect(
      await consumer.handleRawMessage(
        'pokeverse.notifications.email.v1',
        encryptedEnvelope,
      ),
    ).toBe('duplicate');
    expect(sendNotification).toHaveBeenCalledTimes(1);

    expect(
      await consumer.handleRawMessage(
        'pokeverse.notifications.email.v1',
        '{"version":1,"ciphertext":"tampered"}',
      ),
    ).toBe('dlq');
    expect(publishDlq).toHaveBeenCalledTimes(1);
    expect(publishDlq).toHaveBeenCalledWith(
      'pokeverse.notifications.email.v1',
      '{"redacted":true}',
      expect.any(String),
      null,
    );
  });
});
