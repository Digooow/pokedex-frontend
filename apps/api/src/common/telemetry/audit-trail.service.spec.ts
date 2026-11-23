import { PrismaService } from '../../infra/prisma.service';
import { AuditTrailService } from './audit-trail.service';
import { StructuredLoggerService } from './structured-logger.service';

describe('AuditTrailService', () => {
  it('persists sanitized audit entry and emits structured log', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const prisma = { auditLog: { create } } as unknown as PrismaService;
    const emitEvent = jest.fn();
    const logger = {
      emitEvent,
      debug: jest.fn(),
    } as unknown as StructuredLoggerService;

    const service = new AuditTrailService(prisma, logger);
    await service.record({
      actorTrainerId: 'trainer-1',
      actorRole: 'TRAINER',
      action: 'lgpd.account.delete',
      resource: 'trainer:trainer-1',
      outcome: 'SUCCESS',
      metadata: { token: 'secret-value', reason: 'user-request' },
    });

    expect(create).toHaveBeenCalledTimes(1);
    const callArg = create.mock.calls[0] as unknown as [
      {
        data: {
          actorTrainerId: string | null;
          actorRole: string;
          action: string;
          outcome: string;
          metadata: Record<string, unknown>;
        };
      },
    ];
    expect(callArg[0].data.actorTrainerId).toBe('trainer-1');
    expect(callArg[0].data.actorRole).toBe('TRAINER');
    expect(callArg[0].data.action).toBe('lgpd.account.delete');
    expect(callArg[0].data.outcome).toBe('SUCCESS');
    expect(callArg[0].data.metadata).toEqual({
      token: '[REDACTED]',
      reason: 'user-request',
    });
    expect(emitEvent).toHaveBeenCalled();
  });
});
