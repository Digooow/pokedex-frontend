import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionService } from '../../modules/auth/session.service';
import { ALLOW_MFA_PENDING_KEY } from '../decorators/allow-mfa-pending.decorator';
import type { RequestWithTrainer } from '../decorators/current-trainer.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export function readSessionCookie(
  req: RequestWithTrainer,
  cookieName: string,
): string | undefined {
  const cookies: unknown = req.cookies;
  if (typeof cookies !== 'object' || cookies === null) {
    return undefined;
  }
  const value = (cookies as Record<string, unknown>)[cookieName];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isPublic) {
      await this.authenticateRequest(context);
    }

    return true;
  }

  private async authenticateRequest(context: ExecutionContext): Promise<void> {
    const req = context.switchToHttp().getRequest<RequestWithTrainer>();
    const { sessionCookieName } = this.sessionService.getCookieNames();
    const rawSid = readSessionCookie(req, sessionCookieName);

    const session = await this.sessionService.getSessionByRawSid(rawSid);
    if (!session) {
      throw new UnauthorizedException('Sessão ausente ou expirada.');
    }

    const allowMfaPending = this.reflector.getAllAndOverride<boolean>(
      ALLOW_MFA_PENDING_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (session.state === 'MFA_PENDING' && !allowMfaPending) {
      throw new ForbiddenException(
        'Autenticação em duas etapas (2FA) pendente para acessar este recurso.',
      );
    }

    req.trainer = {
      trainerId: session.trainerId,
      username: session.username,
      sessionState: session.state,
      familyId: session.familyId,
      sidHash: session.sidHash,
    };
  }
}
