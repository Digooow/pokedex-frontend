import { ConfigService } from '@nestjs/config';
import type { ApiEnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../infra/prisma.service';
import type { RedisService } from '../../infra/redis.service';
import { SessionService } from '../../modules/auth/session.service';
import type { TrainerAccountRepository } from '../../modules/auth/trainer-account.repository';
import { TrainerGdprService } from '../../modules/auth/trainer-gdpr.service';
import { CryptoService } from '../security/crypto.service';
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

  it('audits LGPD export and deletion in TrainerGdprService with pseudonymized resource and preserved actorRole', async () => {
    const trainerId = '550e8400-e29b-41d4-a716-446655440000';
    const createAudit = jest.fn().mockResolvedValue({ id: 'audit-2' });
    const prismaMock = {
      auditLog: { create: createAudit },
    } as unknown as PrismaService;
    const logger = {
      emitEvent: jest.fn(),
      debug: jest.fn(),
    } as unknown as StructuredLoggerService;
    const auditTrail = new AuditTrailService(prismaMock, logger);

    const configMock = {
      get: jest.fn((key: keyof ApiEnvConfig) => {
        if (key === 'APP_ENCRYPTION_KEY') {
          return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        }
        if (key === 'SESSION_TTL_SEC') {
          return 900;
        }
        return '';
      }),
    } as unknown as ConfigService<ApiEnvConfig, true>;

    const crypto = new CryptoService(configMock);
    const redisMock = {
      getSetMembers: jest.fn().mockResolvedValue([]),
      delKeys: jest.fn().mockResolvedValue(0),
    } as unknown as RedisService;
    const sessionService = new SessionService(redisMock, crypto, configMock);

    const trainerSnapshot = {
      id: trainerId,
      username: 'Lance_Admin',
      email: 'lance@pokeverse.dev',
      emailVerifiedAt: new Date('2026-11-20T00:00:00.000Z'),
      mfaEnabled: false,
      role: 'ADMIN' as const,
      passwordHash: null,
      badgesCount: 8,
      eloRating: 1850,
      lastMapId: 'indigo-plateau',
      lastX: 120,
      lastY: 200,
      createdAt: new Date('2026-11-20T00:00:00.000Z'),
      oauthAccounts: [],
      passkeys: [],
      pokedexSlots: [],
    };
    const repoMock = {
      findExportSnapshotById: jest.fn().mockResolvedValue(trainerSnapshot),
      deleteTrainerById: jest.fn().mockResolvedValue(true),
    } as unknown as TrainerAccountRepository;

    const gdpr = new TrainerGdprService(
      repoMock,
      redisMock,
      crypto,
      sessionService,
      auditTrail,
    );

    await gdpr.exportTrainerData(trainerId, 'ADMIN', 'trace-exp');
    await gdpr.deleteTrainerAccount(
      trainerId,
      undefined,
      undefined,
      'ADMIN',
      'trace-del',
    );

    const expectedResource = `trainer_sha256:${crypto.sha256Hex(trainerId)}`;
    const calls = createAudit.mock.calls as unknown as Array<
      [{ readonly data: Record<string, unknown> }]
    >;
    expect(calls[0]?.[0].data).toMatchObject({
      actorTrainerId: trainerId,
      actorRole: 'ADMIN',
      action: 'lgpd.account.export',
      resource: expectedResource,
      outcome: 'SUCCESS',
      traceId: 'trace-exp',
    });
    expect(calls[1]?.[0].data).toMatchObject({
      actorTrainerId: null,
      actorRole: 'ADMIN',
      action: 'lgpd.account.delete',
      resource: expectedResource,
      outcome: 'SUCCESS',
      traceId: 'trace-del',
    });
  });
});
