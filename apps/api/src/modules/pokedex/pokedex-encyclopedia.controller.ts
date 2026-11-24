import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import {
  type CacheOutcome,
  PokemonIdentifierParamSchema,
} from '@pokeverse/shared';
import {
  type CachedAbilityDetailResponse,
  type CachedBerryDetailResponse,
  type CachedEggGroupDetailResponse,
  type CachedEncyclopediaListResponse,
  type CachedGrowthRateDetailResponse,
  type CachedItemDetailResponse,
  type CachedLocationDetailResponse,
  type CachedMoveDetailResponse,
  type CachedNatureDetailResponse,
  type CachedNaturesListResponse,
  type CachedPokedexDetailResponse,
  type CachedRegionDetailResponse,
  type CachedTypeDetailResponse,
  type CachedTypesListResponse,
  type EncyclopediaPaginationQuery,
  EncyclopediaPaginationQuerySchema,
} from '@pokeverse/shared/pokedex-encyclopedia';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PokedexEncyclopediaService } from './pokedex-encyclopedia.service';

@Controller('pokedex')
export class PokedexEncyclopediaController {
  constructor(private readonly encyclopedia: PokedexEncyclopediaService) {}

  @Public()
  @Get('moves')
  listMoves(
    @Query(new ZodValidationPipe(EncyclopediaPaginationQuerySchema))
    query: EncyclopediaPaginationQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedEncyclopediaListResponse> {
    return this.sendCached(res, this.encyclopedia.listResource('move', query));
  }

  @Public()
  @Get('moves/:idOrName')
  getMove(
    @Param('idOrName', new ZodValidationPipe(PokemonIdentifierParamSchema))
    idOrName: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedMoveDetailResponse> {
    return this.sendCached(res, this.encyclopedia.getMove(idOrName));
  }

  @Public()
  @Get('abilities')
  listAbilities(
    @Query(new ZodValidationPipe(EncyclopediaPaginationQuerySchema))
    query: EncyclopediaPaginationQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedEncyclopediaListResponse> {
    return this.sendCached(
      res,
      this.encyclopedia.listResource('ability', query),
    );
  }

  @Public()
  @Get('abilities/:idOrName')
  getAbility(
    @Param('idOrName', new ZodValidationPipe(PokemonIdentifierParamSchema))
    idOrName: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedAbilityDetailResponse> {
    return this.sendCached(res, this.encyclopedia.getAbility(idOrName));
  }

  @Public()
  @Get('items')
  listItems(
    @Query(new ZodValidationPipe(EncyclopediaPaginationQuerySchema))
    query: EncyclopediaPaginationQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedEncyclopediaListResponse> {
    return this.sendCached(res, this.encyclopedia.listResource('item', query));
  }

  @Public()
  @Get('items/:idOrName')
  getItem(
    @Param('idOrName', new ZodValidationPipe(PokemonIdentifierParamSchema))
    idOrName: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedItemDetailResponse> {
    return this.sendCached(res, this.encyclopedia.getItem(idOrName));
  }

  @Public()
  @Get('berries')
  listBerries(
    @Query(new ZodValidationPipe(EncyclopediaPaginationQuerySchema))
    query: EncyclopediaPaginationQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedEncyclopediaListResponse> {
    return this.sendCached(res, this.encyclopedia.listResource('berry', query));
  }

  @Public()
  @Get('berries/:idOrName')
  getBerry(
    @Param('idOrName', new ZodValidationPipe(PokemonIdentifierParamSchema))
    idOrName: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedBerryDetailResponse> {
    return this.sendCached(res, this.encyclopedia.getBerry(idOrName));
  }

  @Public()
  @Get('regions')
  listRegions(
    @Query(new ZodValidationPipe(EncyclopediaPaginationQuerySchema))
    query: EncyclopediaPaginationQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedEncyclopediaListResponse> {
    return this.sendCached(
      res,
      this.encyclopedia.listResource('region', query),
    );
  }

  @Public()
  @Get('regions/:idOrName')
  getRegion(
    @Param('idOrName', new ZodValidationPipe(PokemonIdentifierParamSchema))
    idOrName: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedRegionDetailResponse> {
    return this.sendCached(res, this.encyclopedia.getRegion(idOrName));
  }

  @Public()
  @Get('pokedexes')
  listPokedexes(
    @Query(new ZodValidationPipe(EncyclopediaPaginationQuerySchema))
    query: EncyclopediaPaginationQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedEncyclopediaListResponse> {
    return this.sendCached(
      res,
      this.encyclopedia.listResource('pokedex', query),
    );
  }

  @Public()
  @Get('pokedexes/:idOrName')
  getPokedex(
    @Param('idOrName', new ZodValidationPipe(PokemonIdentifierParamSchema))
    idOrName: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedPokedexDetailResponse> {
    return this.sendCached(res, this.encyclopedia.getPokedex(idOrName));
  }

  @Public()
  @Get('locations')
  listLocations(
    @Query(new ZodValidationPipe(EncyclopediaPaginationQuerySchema))
    query: EncyclopediaPaginationQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedEncyclopediaListResponse> {
    return this.sendCached(
      res,
      this.encyclopedia.listResource('location', query),
    );
  }

  @Public()
  @Get('locations/:idOrName')
  getLocation(
    @Param('idOrName', new ZodValidationPipe(PokemonIdentifierParamSchema))
    idOrName: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedLocationDetailResponse> {
    return this.sendCached(res, this.encyclopedia.getLocation(idOrName));
  }

  @Public()
  @Get('egg-groups')
  listEggGroups(
    @Query(new ZodValidationPipe(EncyclopediaPaginationQuerySchema))
    query: EncyclopediaPaginationQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedEncyclopediaListResponse> {
    return this.sendCached(
      res,
      this.encyclopedia.listResource('egg-group', query),
    );
  }

  @Public()
  @Get('egg-groups/:idOrName')
  getEggGroup(
    @Param('idOrName', new ZodValidationPipe(PokemonIdentifierParamSchema))
    idOrName: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedEggGroupDetailResponse> {
    return this.sendCached(res, this.encyclopedia.getEggGroup(idOrName));
  }

  @Public()
  @Get('growth-rates')
  listGrowthRates(
    @Query(new ZodValidationPipe(EncyclopediaPaginationQuerySchema))
    query: EncyclopediaPaginationQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedEncyclopediaListResponse> {
    return this.sendCached(
      res,
      this.encyclopedia.listResource('growth-rate', query),
    );
  }

  @Public()
  @Get('growth-rates/:idOrName')
  getGrowthRate(
    @Param('idOrName', new ZodValidationPipe(PokemonIdentifierParamSchema))
    idOrName: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedGrowthRateDetailResponse> {
    return this.sendCached(res, this.encyclopedia.getGrowthRate(idOrName));
  }

  @Public()
  @Get('natures')
  listNatures(
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedNaturesListResponse> {
    return this.sendCached(res, this.encyclopedia.listNatures());
  }

  @Public()
  @Get('natures/:idOrName')
  getNature(
    @Param('idOrName', new ZodValidationPipe(PokemonIdentifierParamSchema))
    idOrName: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedNatureDetailResponse> {
    return this.sendCached(res, this.encyclopedia.getNature(idOrName));
  }

  @Public()
  @Get('types')
  listTypes(
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedTypesListResponse> {
    return this.sendCached(res, this.encyclopedia.listTypes());
  }

  @Public()
  @Get('types/:idOrName')
  getType(
    @Param('idOrName', new ZodValidationPipe(PokemonIdentifierParamSchema))
    idOrName: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CachedTypeDetailResponse> {
    return this.sendCached(res, this.encyclopedia.getType(idOrName));
  }

  private async sendCached<T extends { readonly cache: CacheOutcome }>(
    res: Response,
    pending: Promise<T>,
  ): Promise<T> {
    const result = await pending;
    res.setHeader('X-Cache', result.cache.toUpperCase());
    return result;
  }
}
