import { Module } from '@nestjs/common';
import { PokeApiCacheService } from './pokeapi-cache.service';
import { PokeApiHttpCacheClient } from './pokeapi-http-cache.client';
import { PokeApiResourceFetcher } from './pokeapi-resource.fetcher';
import { PokedexController } from './pokedex.controller';
import { PokedexEnrichmentService } from './pokedex-enrichment.service';
import { PokedexSlotRepository } from './pokedex-slot.repository';
import { PokedexSlotsService } from './pokedex-slots.service';

@Module({
  controllers: [PokedexController],
  providers: [
    PokeApiHttpCacheClient,
    PokeApiResourceFetcher,
    PokeApiCacheService,
    PokedexEnrichmentService,
    PokedexSlotRepository,
    PokedexSlotsService,
  ],
})
export class PokedexModule {}
