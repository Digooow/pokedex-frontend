import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

export interface AuthenticatedTrainer {
  readonly trainerId: string;
  readonly username: string;
}

export interface RequestWithTrainer extends Request {
  trainer?: AuthenticatedTrainer;
}

export const CurrentTrainer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedTrainer => {
    const req = ctx.switchToHttp().getRequest<RequestWithTrainer>();
    if (!req.trainer) {
      throw new UnauthorizedException('Sessão de treinador não autenticada.');
    }
    return req.trainer;
  },
);
