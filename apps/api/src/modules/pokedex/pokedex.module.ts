import { Module } from '@nestjs/common';
import { PokeApiCacheService } from './pokeapi-cache.service';
import { PokedexController } from './pokedex.controller';
import { PokedexSlotsService } from './pokedex-slots.service';

@Module({
  controllers: [PokedexController],
  providers: [PokeApiCacheService, PokedexSlotsService],
})
export class PokedexModule {}
