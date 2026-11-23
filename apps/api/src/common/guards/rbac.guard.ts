import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  hasRequiredRole,
  hasRequiredScopes,
  type PermissionScope,
  ROLE_DEFAULT_SCOPES,
  type TrainerRole,
} from '@pokeverse/shared';
import type { RequestWithTrainer } from '../decorators/current-trainer.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY, SCOPES_KEY } from '../decorators/rbac.decorator';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredRoles =
      this.reflector.getAllAndOverride<TrainerRole[] | undefined>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const requiredScopes =
      this.reflector.getAllAndOverride<PermissionScope[] | undefined>(
        SCOPES_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    if (requiredRoles.length === 0 && requiredScopes.length === 0) {
      return true;
    }
    if (isPublic) {
      return (
        hasRequiredRole('VISITOR', requiredRoles) &&
        hasRequiredScopes(ROLE_DEFAULT_SCOPES.VISITOR, requiredScopes)
      );
    }

    const req = context.switchToHttp().getRequest<RequestWithTrainer>();
    const currentRole: TrainerRole = req.trainer?.role ?? 'VISITOR';
    const currentScopes = ROLE_DEFAULT_SCOPES[currentRole];

    if (
      !hasRequiredRole(currentRole, requiredRoles) ||
      !hasRequiredScopes(currentScopes, requiredScopes)
    ) {
      throw new ForbiddenException(
        'Permissões insuficientes para executar esta operação.',
      );
    }
    return true;
  }
}
