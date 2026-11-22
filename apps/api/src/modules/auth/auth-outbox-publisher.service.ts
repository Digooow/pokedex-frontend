import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type EmailNotificationEvent,
  EmailNotificationEventSchema,
  EncryptedOutboxPayloadSchema,
  KAFKA_TOPICS,
  WorldTickerEventSchema,
} from '@pokeverse/shared';
import { CryptoService } from '../../common/security/crypto.service';

@Injectable()
export class AuthOutboxPublisher {
  constructor(private readonly crypto: CryptoService) {}

  async enqueueTrainerRegisteredWorldEvent(
    tx: Prisma.TransactionClient,
    params: {
      readonly trainerId: string;
      readonly username: string;
      readonly traceId: string | null;
    },
  ): Promise<void> {
    const worldEventId = randomUUID();
    const worldPayload = WorldTickerEventSchema.parse({
      eventId: worldEventId,
      eventType: 'trainer.registered',
      trainerId: params.trainerId,
      username: params.username,
      summary: `${params.username} iniciou sua jornada em PokéVerse.`,
      occurredAt: new Date().toISOString(),
      traceId: params.traceId,
    });

    await tx.outboxEvent.create({
      data: {
        id: worldEventId,
        aggregateType: 'Trainer',
        aggregateId: params.trainerId,
        eventType: KAFKA_TOPICS.WORLD_EVENTS,
        payload: worldPayload,
        status: 'PENDING',
      },
    });
  }

  async enqueueEncryptedEmail(
    tx: Prisma.TransactionClient,
    params: {
      readonly aggregateId: string;
      readonly template: EmailNotificationEvent['template'];
      readonly toEmail: string;
      readonly username: string;
      readonly subject: string;
      readonly otpCode?: string;
      readonly detail?: string;
      readonly traceId: string | null;
    },
  ): Promise<void> {
    const eventId = randomUUID();
    const emailEvent = EmailNotificationEventSchema.parse({
      eventId,
      template: params.template,
      toEmail: params.toEmail,
      username: params.username,
      subject: params.subject,
      ...(params.otpCode ? { otpCode: params.otpCode } : {}),
      ...(params.detail ? { detail: params.detail } : {}),
      requestedAt: new Date().toISOString(),
      traceId: params.traceId,
    });

    const encryptedEnvelope = EncryptedOutboxPayloadSchema.parse({
      version: 1,
      ciphertext: this.crypto.encryptJson(emailEvent),
    });

    await tx.outboxEvent.create({
      data: {
        id: eventId,
        aggregateType: 'EmailNotification',
        aggregateId: params.aggregateId,
        eventType: KAFKA_TOPICS.NOTIFICATIONS_EMAIL,
        payload: encryptedEnvelope,
        status: 'PENDING',
      },
    });
  }
}
