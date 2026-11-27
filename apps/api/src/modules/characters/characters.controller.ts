import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type AllocateAttributesInput,
  AllocateAttributesSchema,
  CharacterIdParamSchema,
  type CharacterListResponse,
  type CharacterSheet,
  type CreateCharacterInput,
  CreateCharacterSchema,
  type ListCharactersQuery,
  ListCharactersQuerySchema,
} from '@pokeverse/shared';
import {
  type AuthenticatedTrainer,
  CurrentTrainer,
} from '../../common/decorators/current-trainer.decorator';
import { Roles, Scopes } from '../../common/decorators/rbac.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CharactersService } from './characters.service';

@Controller('characters')
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  @Roles('TRAINER', 'MODERATOR', 'ADMIN')
  @Scopes('character:read')
  @Get()
  listCharacters(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
    @Query(new ZodValidationPipe(ListCharactersQuerySchema))
    query: ListCharactersQuery,
  ): Promise<CharacterListResponse> {
    return this.charactersService.listCharacters(trainer.trainerId, query);
  }

  @Roles('TRAINER', 'MODERATOR', 'ADMIN')
  @Scopes('character:read')
  @Get(':id')
  getCharacter(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
    @Param('id', new ZodValidationPipe(CharacterIdParamSchema)) id: string,
  ): Promise<CharacterSheet> {
    return this.charactersService.getCharacterById(trainer.trainerId, id);
  }

  @Roles('TRAINER', 'MODERATOR', 'ADMIN')
  @Scopes('character:write')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createCharacter(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
    @Body(new ZodValidationPipe(CreateCharacterSchema))
    body: CreateCharacterInput,
  ): Promise<CharacterSheet> {
    return this.charactersService.createCharacter(trainer.trainerId, body);
  }

  @Roles('TRAINER', 'MODERATOR', 'ADMIN')
  @Scopes('character:write')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/attributes/allocate')
  @HttpCode(HttpStatus.OK)
  allocateAttributes(
    @CurrentTrainer() trainer: AuthenticatedTrainer,
    @Param('id', new ZodValidationPipe(CharacterIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(AllocateAttributesSchema))
    body: AllocateAttributesInput,
  ): Promise<CharacterSheet> {
    return this.charactersService.allocateAttributePoints(
      trainer.trainerId,
      id,
      body,
    );
  }
}
