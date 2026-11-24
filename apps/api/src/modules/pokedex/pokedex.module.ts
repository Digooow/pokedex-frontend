import { Module } from '@nestjs/common';
import { PokeApiCacheService } from './pokeapi-cache.service';
import { PokeApiHttpCacheClient } from './pokeapi-http-cache.client';
import { PokeApiResourceFetcher } from './pokeapi-resource.fetcher';
import { PokedexCatalogService } from './pokedex-catalog.service';
import { PokedexController } from './pokedex.controller';
import { PokedexEncyclopediaController } from './pokedex-encyclopedia.controller';
import { PokedexEncyclopediaService } from './pokedex-encyclopedia.service';
import { PokedexEnrichmentService } from './pokedex-enrichment.service';
import { PokedexSlotRepository } from './pokedex-slot.repository';
import { PokedexSlotsService } from './pokedex-slots.service';

@Module({
  controllers: [PokedexController, PokedexEncyclopediaController],
  providers: [
    PokeApiHttpCacheClient,
    PokeApiResourceFetcher,
    PokeApiCacheService,
    PokedexCatalogService,
    PokedexEncyclopediaService,
    PokedexEnrichmentService,
    PokedexSlotRepository,
    PokedexSlotsService,
  ],
})
export class PokedexModule {}
