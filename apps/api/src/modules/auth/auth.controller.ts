import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  type AuthSessionResponse,
  type LoginTrainerInput,
  LoginTrainerSchema,
  type RegisterTrainerInput,
  RegisterTrainerSchema,
  type TrainerProfile,
} from '@pokeverse/shared';
import type { Request, Response } from 'express';
import {
  type AuthenticatedTrainer,
  CurrentTrainer,
} from '../../common/decorators/current-trainer.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { RequestWithTrace } from '../../common/middleware/correlation.middleware';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { ApiEnvConfig } from '../../config/env.schema';
import { AuthService } from './auth.service';

const REFRESH_COOKIE_NAME = 'pokeverse_refresh';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<ApiEnvConfig, true>,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(RegisterTrainerSchema))
    body: RegisterTrainerInput,
    @Req() req: RequestWithTrace,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponse> {
    const result = await this.authService.register(body, req.traceId ?? null);
    this.setRefreshCookie(res, result.refreshToken);
    return result.session;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(LoginTrainerSchema)) body: LoginTrainerInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponse> {
    const result = await this.authService.login(body);
    this.setRefreshCookie(res, result.refreshToken);
    return result.session;
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponse> {
    const rawCookie = this.extractRefreshCookie(req);
    const result = await this.authService.refresh(rawCookie);
    this.setRefreshCookie(res, result.refreshToken);
    return result.session;
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const rawCookie = this.extractRefreshCookie(req);
    await this.authService.logout(rawCookie);
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      path: REFRESH_COOKIE_PATH,
    });
  }

  @Get('me')
  async me(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
  ): Promise<TrainerProfile> {
    return this.authService.getMe(trainer.trainerId);
  }

  private setRefreshCookie(res: Response, token: string): void {
    const days = this.config.get('JWT_REFRESH_TTL_DAYS', { infer: true });
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      path: REFRESH_COOKIE_PATH,
      maxAge: days * 86_400_000,
    });
  }

  private extractRefreshCookie(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const raw = cookies?.[REFRESH_COOKIE_NAME];
    return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  }
}
