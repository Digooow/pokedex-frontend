import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AllocateAttributesInput,
  CHARACTER_INITIAL_ATTRIBUTE_POOL,
  CHARACTER_MAX_PER_ACCOUNT,
  CharacterAppearanceSchema,
  type CharacterListResponse,
  CharacterListResponseSchema,
  type CharacterOriginKey,
  CharacterOriginKeySchema,
  type CharacterSheet,
  CharacterSheetSchema,
  type CreateCharacterInput,
  type ListCharactersQuery,
  buildCharacterVitalsState,
  buildInitialAttributes,
  computeCharacterDerivedVitals,
  getCharacterOriginByKey,
  normalizeCharacterName,
  sanitizeCharacterDisplayName,
  sumAttributeAllocation,
} from '@pokeverse/shared';
import {
  CharacterRepository,
  type PersistedCharacterWithAttributes,
} from './character.repository';

@Injectable()
export class CharactersService {
  constructor(private readonly characterRepository: CharacterRepository) {}

  async listCharacters(
    accountId: string,
    query: ListCharactersQuery,
  ): Promise<CharacterListResponse> {
    const result = await this.characterRepository.findPaginatedByAccountId(
      accountId,
      { limit: query.limit, offset: query.offset },
    );

    return CharacterListResponseSchema.parse({
      items: result.items.map((item) => this.toCharacterSheet(item)),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    });
  }

  async getCharacterById(
    accountId: string,
    characterId: string,
  ): Promise<CharacterSheet> {
    const record = await this.characterRepository.findByIdForAccount(
      characterId,
      accountId,
    );
    if (!record) {
      throw new NotFoundException('Personagem não encontrado para esta conta.');
    }
    return this.toCharacterSheet(record);
  }

  async createCharacter(
    accountId: string,
    input: CreateCharacterInput,
  ): Promise<CharacterSheet> {
    const totalPoints = sumAttributeAllocation(input.initialAttributes);
    if (totalPoints !== CHARACTER_INITIAL_ATTRIBUTE_POOL) {
      throw new BadRequestException(
        `Distribua exatamente ${CHARACTER_INITIAL_ATTRIBUTE_POOL} pontos iniciais.`,
      );
    }

    const displayName = sanitizeCharacterDisplayName(input.name);
    const normalizedName = normalizeCharacterName(displayName);
    const origin = getCharacterOriginByKey(input.originKey);
    const initialAttributes = buildInitialAttributes(input.initialAttributes);
    const vitals = computeCharacterDerivedVitals(1, initialAttributes);

    const outcome =
      await this.characterRepository.createCharacterWithAttributes({
        accountId,
        name: displayName,
        normalizedName,
        originKey: origin.key,
        appearance: input.appearance,
        attributes: initialAttributes,
        hpCurrent: vitals.hpMax,
        staminaCurrent: vitals.staminaMax,
        manaCurrent: vitals.manaMax,
        hexQ: origin.startingHex.q,
        hexR: origin.startingHex.r,
        hexZ: origin.startingHex.z,
      });

    if (outcome.status === 'limit_reached') {
      throw new ConflictException(
        `Limite máximo de ${CHARACTER_MAX_PER_ACCOUNT} personagens por conta atingido.`,
      );
    }
    if (outcome.status === 'name_taken') {
      throw new ConflictException(
        'Já existe um personagem cadastrado com esse nome.',
      );
    }

    return this.toCharacterSheet(outcome.character);
  }

  async allocateAttributePoints(
    accountId: string,
    characterId: string,
    input: AllocateAttributesInput,
  ): Promise<CharacterSheet> {
    const totalPoints = sumAttributeAllocation(input.allocations);
    if (totalPoints <= 0) {
      throw new BadRequestException(
        'Informe ao menos 1 ponto de atributo para alocar.',
      );
    }

    const outcome = await this.characterRepository.allocateAttributesAtomically(
      {
        characterId,
        accountId,
        allocations: input.allocations,
        totalPoints,
      },
    );

    if (outcome.status === 'not_found') {
      throw new NotFoundException('Personagem não encontrado para esta conta.');
    }
    if (outcome.status === 'insufficient_points') {
      throw new ConflictException(
        `Pontos disponíveis insuficientes (${outcome.availablePoints} restante(s)).`,
      );
    }

    return this.toCharacterSheet(outcome.character);
  }

  private toCharacterSheet(
    row: PersistedCharacterWithAttributes,
  ): CharacterSheet {
    if (!row.attributes) {
      throw new NotFoundException('Atributos do personagem indisponíveis.');
    }

    const originKey: CharacterOriginKey = CharacterOriginKeySchema.parse(
      row.originKey,
    );
    const origin = getCharacterOriginByKey(originKey);
    const appearance = CharacterAppearanceSchema.parse(row.appearance);
    const derived = computeCharacterDerivedVitals(row.level, row.attributes);

    return CharacterSheetSchema.parse({
      id: row.id,
      accountId: row.accountId,
      name: row.name,
      originKey: origin.key,
      originLabel: origin.label,
      startingRegionName: origin.startingRegionName,
      classlessMode: true,
      appearance,
      level: row.level,
      totalSkillMilestones: Number(row.totalSkillMilestones),
      availableAttributePoints: row.availableAttributePoints,
      hexQ: row.hexQ,
      hexR: row.hexR,
      hexZ: row.hexZ,
      presenceMode: row.presenceMode,
      attributes: row.attributes,
      vitals: buildCharacterVitalsState({
        originKey: origin.key,
        derived,
        current: {
          hpCurrent: row.hpCurrent,
          staminaCurrent: row.staminaCurrent,
          manaCurrent: row.manaCurrent,
          hungerCurrent: row.hungerCurrent,
          thirstCurrent: row.thirstCurrent,
          fatigueCurrent: row.fatigueCurrent,
        },
      }),
      starterKit: [...origin.starterKit],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
}
