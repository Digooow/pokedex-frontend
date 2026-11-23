import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY, SCOPES_KEY } from '../decorators/rbac.decorator';
import { RbacGuard } from './rbac.guard';

function createContext(trainerRole?: 'TRAINER' | 'MODERATOR' | 'ADMIN') {
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({
      getRequest: () => ({
        trainer: trainerRole ? { role: trainerRole } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('RbacGuard', () => {
  it('allows routes without @Roles or @Scopes metadata', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new RbacGuard(reflector);

    expect(guard.canActivate(createContext())).toBe(true);
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
