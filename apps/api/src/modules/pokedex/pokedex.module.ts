import { Module } from '@nestjs/common';
import { PokeApiCacheService } from './pokeapi-cache.service';
import { PokedexController } from './pokedex.controller';
import { PokedexSlotRepository } from './pokedex-slot.repository';
import { PokedexSlotsService } from './pokedex-slots.service';

@Module({
  controllers: [PokedexController],
  providers: [PokeApiCacheService, PokedexSlotRepository, PokedexSlotsService],
})
export class PokedexModule {}
