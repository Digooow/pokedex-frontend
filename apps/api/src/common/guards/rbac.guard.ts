import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
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
import type { RequestWithTrace } from '../middleware/correlation.middleware';
import { AuditTrailService } from '../telemetry/audit-trail.service';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly auditTrail?: AuditTrailService,
  ) {}

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

    if (isPublic) {
      if (requiredRoles.length === 0 && requiredScopes.length === 0) {
        return true;
      }
      return (
        hasRequiredRole('VISITOR', requiredRoles) &&
        hasRequiredScopes(ROLE_DEFAULT_SCOPES.VISITOR, requiredScopes)
      );
    }

    const req = context
      .switchToHttp()
      .getRequest<RequestWithTrainer & Partial<RequestWithTrace>>();
    const currentRole: TrainerRole = req.trainer?.role ?? 'VISITOR';

    if (requiredRoles.length === 0 && requiredScopes.length === 0) {
      this.recordDeniedAccess(req, currentRole, 'missing_rbac_policy');
      throw new ForbiddenException(
        'Rota privada sem política RBAC (@Roles/@Scopes) declarada.',
      );
    }

    const currentScopes = ROLE_DEFAULT_SCOPES[currentRole];
    if (
      !hasRequiredRole(currentRole, requiredRoles) ||
      !hasRequiredScopes(currentScopes, requiredScopes)
    ) {
      this.recordDeniedAccess(req, currentRole, 'insufficient_permissions');
      throw new ForbiddenException(
        'Permissões insuficientes para executar esta operação.',
      );
    }
    return true;
  }

  private recordDeniedAccess(
    req: RequestWithTrainer & Partial<RequestWithTrace>,
    actorRole: TrainerRole,
    reason: string,
  ): void {
    void this.auditTrail?.record({
      actorTrainerId: req.trainer?.trainerId ?? null,
      actorRole,
      action: 'rbac.access.denied',
      resource: req.path ?? 'unknown',
      outcome: 'DENIED',
      traceId: req.traceId ?? null,
      metadata: { reason },
    });
  }
}
