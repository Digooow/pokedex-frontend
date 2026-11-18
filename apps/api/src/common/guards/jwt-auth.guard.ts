import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';
import type { ApiEnvConfig } from '../../config/env.schema';
import type { RequestWithTrainer } from '../decorators/current-trainer.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

const AccessJwtPayloadSchema = z.object({
  sub: z.uuid(),
  username: z.string().min(1),
});

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<ApiEnvConfig, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithTrainer>();
    const authHeader = request.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token Bearer ausente ou inválido.');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Token Bearer vazio.');
    }

    try {
      const rawPayload: unknown = await this.jwtService.verifyAsync(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });

      const parsed = AccessJwtPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new UnauthorizedException('Carga útil de sessão inválida.');
      }

      request.trainer = {
        trainerId: parsed.data.sub,
        username: parsed.data.username,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Sessão expirada ou token inválido.');
    }
  }
}
