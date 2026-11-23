import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY, SCOPES_KEY } from '../decorators/rbac.decorator';
import type { AuditTrailService } from '../telemetry/audit-trail.service';
import { RbacGuard } from './rbac.guard';

function createContext(trainerRole?: 'TRAINER' | 'MODERATOR' | 'ADMIN') {
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({
      getRequest: () => ({
        path: '/api/v1/protected',
        traceId: 'trace-123',
        trainer: trainerRole
          ? { trainerId: 'trainer-1', role: trainerRole }
          : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('RbacGuard', () => {
  it('allows @Public() routes without @Roles or @Scopes metadata', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === IS_PUBLIC_KEY ? true : undefined,
      ),
    } as unknown as Reflector;
    const guard = new RbacGuard(reflector);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('denies private routes without @Roles or @Scopes metadata (deny-by-default) and records audit denial', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const record = jest.fn().mockResolvedValue(undefined);
    const guard = new RbacGuard(reflector, {
      record,
    } as unknown as AuditTrailService);

    expect(() => guard.canActivate(createContext('TRAINER'))).toThrow(
      ForbiddenException,
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorTrainerId: 'trainer-1',
        actorRole: 'TRAINER',
        action: 'rbac.access.denied',
        outcome: 'DENIED',
      }),
    );
  });

  it('allows TRAINER with required role and scope', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === IS_PUBLIC_KEY) {
          return false;
        }
        if (key === ROLES_KEY) {
          return ['TRAINER', 'ADMIN'];
        }
        if (key === SCOPES_KEY) {
          return ['pokedex:write'];
        }
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new RbacGuard(reflector);

    expect(guard.canActivate(createContext('TRAINER'))).toBe(true);
  });

  it('denies TRAINER without ops:audit scope', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === IS_PUBLIC_KEY) {
          return false;
        }
        if (key === ROLES_KEY) {
          return ['ADMIN'];
        }
        if (key === SCOPES_KEY) {
          return ['ops:audit'];
        }
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new RbacGuard(reflector);

    expect(() => guard.canActivate(createContext('TRAINER'))).toThrow(
      ForbiddenException,
    );
  });
});
