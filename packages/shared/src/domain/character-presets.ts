export const CHARACTER_NAME_MIN_LENGTH = 3;
export const CHARACTER_NAME_MAX_LENGTH = 24;
export const CHARACTER_STARTING_LEVEL = 1;
export const CHARACTER_BASE_ATTRIBUTE = 5;
export const CHARACTER_INITIAL_ATTRIBUTE_POOL = 10;
export const CHARACTER_MAX_SINGLE_ALLOCATION_BATCH = 100;
export const CHARACTER_MAX_PER_ACCOUNT = 5;
export const CHARACTER_LIST_DEFAULT_LIMIT = 10;
export const CHARACTER_LIST_MAX_LIMIT = 20;

export const CHARACTER_ATTRIBUTE_KEYS = [
  'physique',
  'dexterity',
  'stamina',
  'magic',
  'perception',
  'willpower',
  'handling',
] as const;

export type CharacterAttributeKey = (typeof CHARACTER_ATTRIBUTE_KEYS)[number];
export type CharacterAttributes = Record<CharacterAttributeKey, number>;
export type CharacterAttributeAllocation = Record<CharacterAttributeKey, number>;

export interface CharacterAttributeMeta {
  readonly key: CharacterAttributeKey;
  readonly label: string;
  readonly shortLabel: string;
  readonly subtitle: string;
  readonly mechanicalImpact: string;
}

const CHARACTER_ATTRIBUTE_RAW: readonly string[] = [
  'physique|Físico|FIS|Força & Porte|Dano corpo a corpo, limite de carga (kg) e esforço bruto.',
  'dexterity|Destreza|DES|Agilidade & Coordenação|Velocidade de ataque, esquiva base e precisão manual.',
  'stamina|Fôlego|FOL|Vitalidade & Vigor|HP máximo, reserva de fôlego, marchas e trabalho contínuo.',
  'magic|Magia|MAG|Intelecto & Canalização|Reserva de mana, potência arcana e sustentação de encantos.',
  'perception|Percepção|PER|Sentidos & Leitura|Raio de detecção, chance de crítico e leitura de rastros.',
  'willpower|Vontade|VON|Estabilidade & Espírito|Resistência a maldições, foco sob dano e força de bênçãos.',
  'handling|Manejo|MAN|Liderança & Empatia|Limite de auxiliares/pets, adestramento e gestão de caravana.',
];

export const CHARACTER_ATTRIBUTES_META: readonly CharacterAttributeMeta[] =
  CHARACTER_ATTRIBUTE_RAW.map((raw) => {
    const [key, label, shortLabel, subtitle, mechanicalImpact] = raw.split('|') as [
      CharacterAttributeKey,
      string,
      string,
      string,
      string,
    ];
    return { key, label, shortLabel, subtitle, mechanicalImpact };
  });

export const CHARACTER_BODY_MODELS = ['male', 'female'] as const;
export type CharacterBodyModel = (typeof CHARACTER_BODY_MODELS)[number];

export interface CharacterBodyModelMeta {
  readonly key: CharacterBodyModel;
  readonly label: string;
  readonly subtitle: string;
  readonly modelUrl: string;
}

const MALE_BODY_MODEL: CharacterBodyModelMeta = {
  key: 'male',
  label: 'Aventureiro',
  subtitle: 'Modelo 3D Masculino · Quaternius CC0',
  modelUrl: '/assets/models/characters/adventurer-male.glb',
};

const FEMALE_BODY_MODEL: CharacterBodyModelMeta = {
  key: 'female',
  label: 'Aventureira',
  subtitle: 'Modelo 3D Feminino · Quaternius CC0',
  modelUrl: '/assets/models/characters/adventurer-female.glb',
};

export const CHARACTER_BODY_MODEL_META: readonly CharacterBodyModelMeta[] = [
  MALE_BODY_MODEL,
  FEMALE_BODY_MODEL,
] as const;

export function getCharacterBodyModelMeta(model: CharacterBodyModel): CharacterBodyModelMeta {
  return model === 'female' ? FEMALE_BODY_MODEL : MALE_BODY_MODEL;
}

export const CHARACTER_SKIN_TONES = [
  'porcelain',
  'sand',
  'ochre',
  'bronze',
  'umber',
  'ebony',
] as const;
export type CharacterSkinTone = (typeof CHARACTER_SKIN_TONES)[number];

export const CHARACTER_HAIR_STYLES = [
  'short',
  'long',
  'braid',
  'curly',
  'hooded',
  'shaved',
] as const;
export type CharacterHairStyle = (typeof CHARACTER_HAIR_STYLES)[number];

export const CHARACTER_HAIR_COLORS = [
  'obsidian',
  'chestnut',
  'copper',
  'wheat',
  'ash',
  'indigo',
] as const;
export type CharacterHairColor = (typeof CHARACTER_HAIR_COLORS)[number];

export const CHARACTER_OUTFIT_STYLES = ['tunic', 'cloak', 'apron', 'vest'] as const;
export type CharacterOutfitStyle = (typeof CHARACTER_OUTFIT_STYLES)[number];

export const CHARACTER_OUTFIT_COLORS = [
  'forest',
  'slate',
  'crimson',
  'ochre',
  'cobalt',
  'linen',
] as const;
export type CharacterOutfitColor = (typeof CHARACTER_OUTFIT_COLORS)[number];

export const CHARACTER_PRESENCE_MODES = [
  'ONLINE',
  'OFFLINE_ROUTINE',
  'OFFLINE_SHOP',
  'OFFLINE_GUARD',
] as const;
export type CharacterPresenceMode = (typeof CHARACTER_PRESENCE_MODES)[number];

export const CHARACTER_ORIGIN_KEYS = ['settler', 'harbor', 'highlands'] as const;
export type CharacterOriginKey = (typeof CHARACTER_ORIGIN_KEYS)[number];

export interface CharacterStarterItem {
  readonly key: string;
  readonly name: string;
  readonly category: 'outfit' | 'survival' | 'tool';
  readonly quantity: number;
  readonly weightKg: number;
  readonly durabilityMax: number;
}

export interface CharacterOriginSpec {
  readonly key: CharacterOriginKey;
  readonly label: string;
  readonly startingRegionName: string;
  readonly summary: string;
  readonly startingHex: { readonly q: number; readonly r: number; readonly z: number };
  readonly starterKit: readonly CharacterStarterItem[];
}

const SHARED_SURVIVAL_KIT: readonly CharacterStarterItem[] = [
  {
    key: 'leather_canteen',
    name: 'Cantil de Couro',
    category: 'survival',
    quantity: 1,
    weightKg: 0.8,
    durabilityMax: 40,
  },
  {
    key: 'travel_ration',
    name: 'Ração de Viagem',
    category: 'survival',
    quantity: 3,
    weightKg: 0.9,
    durabilityMax: 15,
  },
  {
    key: 'rustic_multitool',
    name: 'Ferramenta Multifuncional Rústica',
    category: 'tool',
    quantity: 1,
    weightKg: 1.3,
    durabilityMax: 50,
  },
];

const ORIGIN_SUMMARY_SUFFIX = 'com kit rústico equivalente, sem bônus ou trava de classe.';

function createStarterOutfit(key: string, name: string): CharacterStarterItem {
  return {
    key,
    name,
    category: 'outfit',
    quantity: 1,
    weightKg: 1.2,
    durabilityMax: 60,
  };
}

function createOriginSpec(params: {
  readonly key: CharacterOriginKey;
  readonly label: string;
  readonly startingRegionName: string;
  readonly startDescription: string;
  readonly startingHex: { readonly q: number; readonly r: number; readonly z: number };
  readonly outfitKey: string;
  readonly outfitName: string;
}): CharacterOriginSpec {
  return {
    key: params.key,
    label: params.label,
    startingRegionName: params.startingRegionName,
    summary: `Largada em ${params.startDescription} ${ORIGIN_SUMMARY_SUFFIX}`,
    startingHex: params.startingHex,
    starterKit: [createStarterOutfit(params.outfitKey, params.outfitName), ...SHARED_SURVIVAL_KIT],
  };
}

export const CHARACTER_ORIGINS: readonly CharacterOriginSpec[] = [
  createOriginSpec({
    key: 'settler',
    label: 'Filho de Colono',
    startingRegionName: 'Planície dos Marcos',
    startDescription: 'terras abertas férteis',
    startingHex: { q: 0, r: 0, z: 0 },
    outfitKey: 'settler_garb',
    outfitName: 'Túnica de Linho Rústica',
  }),
  createOriginSpec({
    key: 'harbor',
    label: 'Aprendiz de Porto',
    startingRegionName: 'Enseada da Brisa',
    startDescription: 'cais costeiro seguro',
    startingHex: { q: 4, r: -2, z: 0 },
    outfitKey: 'harbor_garb',
    outfitName: 'Casaco de Lona Costeira',
  }),
  createOriginSpec({
    key: 'highlands',
    label: 'Andarilho das Montanhas',
    startingRegionName: 'Passo de Granito',
    startDescription: 'platô elevado firme',
    startingHex: { q: -3, r: 4, z: 1 },
    outfitKey: 'highlands_garb',
    outfitName: 'Manto de Lã Serrana',
  }),
] as const;

type AttributeTuple = readonly [number, number, number, number, number, number, number];

function createAttributeAllocation(values: AttributeTuple): Readonly<CharacterAttributeAllocation> {
  const [physique, dexterity, stamina, magic, perception, willpower, handling] = values;
  return { physique, dexterity, stamina, magic, perception, willpower, handling };
}

export const ZERO_ATTRIBUTE_ALLOCATION: Readonly<CharacterAttributeAllocation> =
  createAttributeAllocation([0, 0, 0, 0, 0, 0, 0]);

export interface CharacterInitialPreset {
  readonly key: 'balanced' | 'vanguard' | 'arcanist';
  readonly label: string;
  readonly hint: string;
  readonly allocation: Readonly<CharacterAttributeAllocation>;
}

export const CHARACTER_INITIAL_PRESETS: readonly CharacterInitialPreset[] = [
  {
    key: 'balanced',
    label: 'Versátil',
    hint: 'Distribuição equilibrada para testar qualquer atividade.',
    allocation: createAttributeAllocation([2, 2, 2, 1, 1, 1, 1]),
  },
  {
    key: 'vanguard',
    label: 'Vanguarda',
    hint: 'Inclinação inicial para carga, resistência física e combate.',
    allocation: createAttributeAllocation([3, 2, 3, 0, 1, 1, 0]),
  },
  {
    key: 'arcanist',
    label: 'Estudioso',
    hint: 'Inclinação inicial para canalização, percepção e manejo.',
    allocation: createAttributeAllocation([0, 1, 1, 3, 2, 2, 1]),
  },
] as const;
