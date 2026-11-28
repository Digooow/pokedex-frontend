import * as z from 'zod';
import {
  CHARACTER_BODY_MODELS,
  CHARACTER_HAIR_COLORS,
  CHARACTER_HAIR_STYLES,
  CHARACTER_INITIAL_ATTRIBUTE_POOL,
  CHARACTER_LIST_DEFAULT_LIMIT,
  CHARACTER_LIST_MAX_LIMIT,
  CHARACTER_MAX_SINGLE_ALLOCATION_BATCH,
  CHARACTER_NAME_MAX_LENGTH,
  CHARACTER_NAME_MIN_LENGTH,
  CHARACTER_OUTFIT_COLORS,
  CHARACTER_OUTFIT_STYLES,
  CHARACTER_ORIGIN_KEYS,
  CHARACTER_PRESENCE_MODES,
  CHARACTER_SKIN_TONES,
} from '../domain/character-presets';
import { sumAttributeAllocation } from '../domain/character-rules';

export const CharacterIdParamSchema = z.uuid('Identificador de personagem inválido.');

export const CharacterNameSchema = z
  .string()
  .trim()
  .min(
    CHARACTER_NAME_MIN_LENGTH,
    `Nome do personagem deve ter ao menos ${CHARACTER_NAME_MIN_LENGTH} caracteres.`,
  )
  .max(
    CHARACTER_NAME_MAX_LENGTH,
    `Nome do personagem deve ter no máximo ${CHARACTER_NAME_MAX_LENGTH} caracteres.`,
  )
  .regex(/^[A-Za-zÀ-ÖØ-öø-ÿ0-9 _-]+$/, 'Use apenas letras, números, espaços simples, "_" ou "-".')
  .refine((value) => !value.includes('  '), 'Evite espaços duplos consecutivos no nome.');

export const CharacterOriginKeySchema = z.enum(CHARACTER_ORIGIN_KEYS);
export const CharacterPresenceModeSchema = z.enum(CHARACTER_PRESENCE_MODES);

export const CharacterAppearanceSchema = z
  .object({
    bodyModel: z.enum(CHARACTER_BODY_MODELS).default('male'),
    skinTone: z.enum(CHARACTER_SKIN_TONES).default('ochre'),
    hairStyle: z.enum(CHARACTER_HAIR_STYLES).default('short'),
    hairColor: z.enum(CHARACTER_HAIR_COLORS).default('obsidian'),
    outfitStyle: z.enum(CHARACTER_OUTFIT_STYLES).default('tunic'),
    outfitColor: z.enum(CHARACTER_OUTFIT_COLORS).default('forest'),
  })
  .strict();

export type CharacterAppearance = z.infer<typeof CharacterAppearanceSchema>;

export const CharacterAttributesSchema = z
  .object({
    physique: z.number().int().min(1),
    dexterity: z.number().int().min(1),
    stamina: z.number().int().min(1),
    magic: z.number().int().min(1),
    perception: z.number().int().min(1),
    willpower: z.number().int().min(1),
    handling: z.number().int().min(1),
  })
  .strict();

const AllocationPointSchema = z
  .number()
  .int('Os pontos de atributo devem ser inteiros.')
  .min(0, 'Não é permitido informar pontos negativos.')
  .max(
    CHARACTER_MAX_SINGLE_ALLOCATION_BATCH,
    `Máximo de ${CHARACTER_MAX_SINGLE_ALLOCATION_BATCH} pontos por atributo por solicitação.`,
  );

export const CharacterAttributeAllocationSchema = z
  .object({
    physique: AllocationPointSchema,
    dexterity: AllocationPointSchema,
    stamina: AllocationPointSchema,
    magic: AllocationPointSchema,
    perception: AllocationPointSchema,
    willpower: AllocationPointSchema,
    handling: AllocationPointSchema,
  })
  .strict();

export const CreateCharacterSchema = z
  .object({
    name: CharacterNameSchema,
    originKey: CharacterOriginKeySchema,
    appearance: CharacterAppearanceSchema,
    initialAttributes: CharacterAttributeAllocationSchema,
  })
  .strict()
  .refine(
    (payload) =>
      sumAttributeAllocation(payload.initialAttributes) === CHARACTER_INITIAL_ATTRIBUTE_POOL,
    {
      message: `Distribua exatamente ${CHARACTER_INITIAL_ATTRIBUTE_POOL} pontos iniciais entre os 7 atributos.`,
      path: ['initialAttributes'],
    },
  );

export type CreateCharacterInput = z.infer<typeof CreateCharacterSchema>;

export const AllocateAttributesSchema = z
  .object({
    allocations: CharacterAttributeAllocationSchema,
  })
  .strict()
  .refine(
    (payload) => {
      const total = sumAttributeAllocation(payload.allocations);
      return total >= 1 && total <= CHARACTER_MAX_SINGLE_ALLOCATION_BATCH;
    },
    {
      message: `Informe entre 1 e ${CHARACTER_MAX_SINGLE_ALLOCATION_BATCH} pontos para alocar.`,
      path: ['allocations'],
    },
  );

export type AllocateAttributesInput = z.infer<typeof AllocateAttributesSchema>;

export const ListCharactersQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(CHARACTER_LIST_MAX_LIMIT)
      .default(CHARACTER_LIST_DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type ListCharactersQuery = z.infer<typeof ListCharactersQuerySchema>;

export const CharacterVitalsStateSchema = z.object({
  hpCurrent: z.number().int().nonnegative(),
  hpMax: z.number().int().positive(),
  staminaCurrent: z.number().int().nonnegative(),
  staminaMax: z.number().int().positive(),
  manaCurrent: z.number().int().nonnegative(),
  manaMax: z.number().int().positive(),
  hungerCurrent: z.number().int().min(0).max(100),
  hungerMax: z.literal(100),
  thirstCurrent: z.number().int().min(0).max(100),
  thirstMax: z.literal(100),
  fatigueCurrent: z.number().int().min(0).max(100),
  fatigueMax: z.literal(100),
  carryCapacityKg: z.number().positive(),
  starterKitWeightKg: z.number().nonnegative(),
  baseDodgeRating: z.number().int().nonnegative(),
  baseDetectionRadius: z.number().positive(),
  curseResistanceBase: z.number().int().nonnegative(),
  companionSlots: z.number().int().positive(),
});

export type CharacterVitalsState = z.infer<typeof CharacterVitalsStateSchema>;

export const CharacterStarterItemSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['outfit', 'survival', 'tool']),
  quantity: z.number().int().positive(),
  weightKg: z.number().positive(),
  durabilityMax: z.number().int().positive(),
});

export const CharacterSheetSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  name: z.string().min(CHARACTER_NAME_MIN_LENGTH).max(CHARACTER_NAME_MAX_LENGTH),
  originKey: CharacterOriginKeySchema,
  originLabel: z.string().min(1),
  startingRegionName: z.string().min(1),
  classlessMode: z.literal(true),
  appearance: CharacterAppearanceSchema,
  level: z.number().int().min(1),
  totalSkillMilestones: z.number().int().nonnegative(),
  availableAttributePoints: z.number().int().nonnegative(),
  hexQ: z.number().int(),
  hexR: z.number().int(),
  hexZ: z.number().int(),
  presenceMode: CharacterPresenceModeSchema,
  attributes: CharacterAttributesSchema,
  vitals: CharacterVitalsStateSchema,
  starterKit: z.array(CharacterStarterItemSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type CharacterSheet = z.infer<typeof CharacterSheetSchema>;

export const CharacterListResponseSchema = z.object({
  items: z.array(CharacterSheetSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(CHARACTER_LIST_MAX_LIMIT),
  offset: z.number().int().nonnegative(),
});

export type CharacterListResponse = z.infer<typeof CharacterListResponseSchema>;
