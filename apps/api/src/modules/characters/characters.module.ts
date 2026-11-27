import { Module } from '@nestjs/common';
import { CharacterRepository } from './character.repository';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';

@Module({
  controllers: [CharactersController],
  providers: [CharacterRepository, CharactersService],
})
export class CharactersModule {}
