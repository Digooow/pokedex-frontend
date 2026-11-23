import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { RequestWithTrainer } from '../decorators/current-trainer.decorator';

@Injectable()
export class TrainerThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const typedReq = req as unknown as RequestWithTrainer;
    if (typedReq.trainer?.trainerId) {
      return Promise.resolve(`trainer:${typedReq.trainer.trainerId}`);
    }
    const rawIp = typedReq.ip;
    return Promise.resolve(
      typeof rawIp === 'string' && rawIp.length > 0
        ? `ip:${rawIp}`
        : 'ip:unknown',
    );
  }
}
