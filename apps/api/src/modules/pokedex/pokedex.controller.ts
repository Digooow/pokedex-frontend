import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type CachedCatalogResponse,
  type CachedPokemonResponse,
  PokedexSlotIndexParamSchema,
  type PokedexSlotRecord,
  PokedexSlotsListResponseSchema,
  PokemonIdentifierParamSchema,
  type SavePokedexSlotInput,
  SavePokedexSlotSchema,
} from '@pokeverse/shared';
import type { Response } from 'express';
import {
  type AuthenticatedTrainer,
  CurrentTrainer,
} from '../../common/decorators/current-trainer.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles, Scopes } from '../../common/decorators/rbac.decorator';
import type { RequestWithTrace } from '../../common/middleware/correlation.middleware';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PokeApiCacheService } from './pokeapi-cache.service';
import { PokedexSlotsService } from './pokedex-slots.service';

@Controller('pokedex')
export class PokedexController {
  constructor(
    private readonly pokeApiCache: PokeApiCacheService,
    private readonly slotsService: PokedexSlotsService,
  ) {}

  @Public()
  @Get('catalog')
  async getCatalog(
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedCatalogResponse> {
    const result = await this.pokeApiCache.getCatalog();
    res.setHeader('X-Cache', result.cache.toUpperCase());
    return result;
  }

  @Public()
  @Get('pokemon/:idOrName')
  async getPokemon(
    @Param('idOrName', new ZodValidationPipe(PokemonIdentifierParamSchema))
    idOrName: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedPokemonResponse> {
    const result = await this.pokeApiCache.getPokemon(idOrName);
    res.setHeader('X-Cache', result.cache.toUpperCase());
    return result;
  }

  @Roles('TRAINER', 'MODERATOR', 'ADMIN')
  @Scopes('pokedex:read')
  @Get('slots')
  async listSlots(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
  ): Promise<{ readonly slots: PokedexSlotRecord[] }> {
    const slots = await this.slotsService.listSlots(trainer.trainerId);
    return PokedexSlotsListResponseSchema.parse({ slots });
  }

  @Roles('TRAINER', 'MODERATOR', 'ADMIN')
  @Scopes('pokedex:write')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Put('slots/:index')
  saveSlot(
    @Param('index', new ZodValidationPipe(PokedexSlotIndexParamSchema))
    index: number,
    @Body(new ZodValidationPipe(SavePokedexSlotSchema))
    body: SavePokedexSlotInput,
    @CurrentTrainer() trainer: AuthenticatedTrainer,
    @Req() req: RequestWithTrace,
  ): Promise<PokedexSlotRecord> {
    return this.slotsService.upsertSlot(
      trainer.trainerId,
      trainer.username,
      index,
      body,
      req.traceId ?? null,
    );
  }

  @Roles('TRAINER', 'MODERATOR', 'ADMIN')
  @Scopes('pokedex:write')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Delete('slots/:index')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSlot(
    @Param('index', new ZodValidationPipe(PokedexSlotIndexParamSchema))
    index: number,
    @CurrentTrainer() trainer: AuthenticatedTrainer,
    @Req() req: RequestWithTrace,
  ): Promise<void> {
    await this.slotsService.clearSlot(
      trainer.trainerId,
      trainer.username,
      index,
      req.traceId ?? null,
    );
  }

  @Roles('TRAINER', 'MODERATOR', 'ADMIN')
  @Scopes('pokedex:write')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Delete('slots')
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearAllSlots(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
    @Req() req: RequestWithTrace,
  ): Promise<void> {
    await this.slotsService.clearAllSlots(
      trainer.trainerId,
      trainer.username,
      req.traceId ?? null,
    );
  }
}
