import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma.service';
import {
  sanitizeLogValue,
  StructuredLoggerService,
} from './structured-logger.service';

export type AuditOutcome = 'SUCCESS' | 'DENIED' | 'ERROR';

export interface AuditRecordInput {
  readonly actorTrainerId?: string | null;
  readonly actorRole: string;
  readonly action: string;
  readonly resource: string;
  readonly outcome: AuditOutcome;
  readonly ipHash?: string | null;
  readonly traceId?: string | null;
  readonly metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditTrailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: StructuredLoggerService,
  ) {}

  async record(input: AuditRecordInput): Promise<void> {
    const safeMetadata = sanitizeLogValue(
      input.metadata ?? {},
    ) as Prisma.InputJsonValue;

    try {
      await this.prisma.auditLog.create({
        data: {
          actorTrainerId: input.actorTrainerId ?? null,
          actorRole: input.actorRole,
          action: input.action,
          resource: input.resource,
          outcome: input.outcome,
          ipHash: input.ipHash ?? null,
          traceId: input.traceId ?? null,
          metadata: safeMetadata,
        },
      });
    } catch (error) {
      this.logger.emitEvent('warn', 'Failed to persist immutable audit log', {
        context: AuditTrailService.name,
        errorCode: 'AUDIT_LOG_PERSIST_FAILED',
        traceId: input.traceId ?? null,
      });
      if (error instanceof Error) {
        this.logger.debug(error.message, AuditTrailService.name);
      }
    }

    this.logger.emitEvent('info', `AUDIT ${input.action} -> ${input.outcome}`, {
      context: AuditTrailService.name,
      traceId: input.traceId ?? null,
    });
  }
}
