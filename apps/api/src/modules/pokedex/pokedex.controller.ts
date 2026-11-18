import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import {
  type CachedCatalogResponse,
  type CachedPokemonResponse,
  type PokedexSlotRecord,
  PokedexSlotsListResponseSchema,
  type SavePokedexSlotInput,
  SavePokedexSlotSchema,
  TOTAL_POKEDEX_SLOTS,
} from '@pokeverse/shared';
import type { Response } from 'express';
import {
  type AuthenticatedTrainer,
  CurrentTrainer,
} from '../../common/decorators/current-trainer.decorator';
import { Public } from '../../common/decorators/public.decorator';
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
    @Param('idOrName') idOrName: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedPokemonResponse> {
    const result = await this.pokeApiCache.getPokemon(idOrName);
    res.setHeader('X-Cache', result.cache.toUpperCase());
    return result;
  }

  @Get('slots')
  async listSlots(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
  ): Promise<{ readonly slots: PokedexSlotRecord[] }> {
    const slots = await this.slotsService.listSlots(trainer.trainerId);
    return PokedexSlotsListResponseSchema.parse({ slots });
  }

  @Put('slots/:index')
  saveSlot(
    @Param('index', ParseIntPipe) index: number,
    @Body(new ZodValidationPipe(SavePokedexSlotSchema))
    body: SavePokedexSlotInput,
    @CurrentTrainer() trainer: AuthenticatedTrainer,
    @Req() req: RequestWithTrace,
  ): Promise<PokedexSlotRecord> {
    this.assertValidSlotIndex(index);
    if (body.slotIndex !== index) {
      throw new BadRequestException(
        'O slotIndex do corpo deve corresponder ao parâmetro da URL.',
      );
    }

    return this.slotsService.upsertSlot(
      trainer.trainerId,
      trainer.username,
      index,
      body,
      req.traceId ?? null,
    );
  }

  @Delete('slots/:index')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSlot(
    @Param('index', ParseIntPipe) index: number,
    @CurrentTrainer() trainer: AuthenticatedTrainer,
    @Req() req: RequestWithTrace,
  ): Promise<void> {
    this.assertValidSlotIndex(index);
    await this.slotsService.clearSlot(
      trainer.trainerId,
      trainer.username,
      index,
      req.traceId ?? null,
    );
  }

  private assertValidSlotIndex(index: number): void {
    if (index < 0 || index >= TOTAL_POKEDEX_SLOTS) {
      throw new BadRequestException('Índice de slot deve estar entre 0 e 9.');
    }
  }
}
