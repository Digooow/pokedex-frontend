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

export const CHARACTER_ATTRIBUTES_META: readonly CharacterAttributeMeta[] = [
  {
    key: 'physique',
    label: 'Físico',
    shortLabel: 'FIS',
    subtitle: 'Força & Porte',
    mechanicalImpact: 'Dano corpo a corpo, limite de carga (kg) e esforço bruto.',
  },
  {
    key: 'dexterity',
    label: 'Destreza',
    shortLabel: 'DES',
    subtitle: 'Agilidade & Coordenação',
    mechanicalImpact: 'Velocidade de ataque, esquiva base e precisão manual.',
  },
  {
    key: 'stamina',
    label: 'Fôlego',
    shortLabel: 'FOL',
    subtitle: 'Vitalidade & Vigor',
    mechanicalImpact: 'HP máximo, reserva de fôlego, marchas e trabalho contínuo.',
  },
  {
    key: 'magic',
    label: 'Magia',
    shortLabel: 'MAG',
    subtitle: 'Intelecto & Canalização',
    mechanicalImpact: 'Reserva de mana, potência arcana e sustentação de encantos.',
  },
  {
    key: 'perception',
    label: 'Percepção',
    shortLabel: 'PER',
    subtitle: 'Sentidos & Leitura',
    mechanicalImpact: 'Raio de detecção, chance de crítico e leitura de rastros.',
  },
  {
    key: 'willpower',
    label: 'Vontade',
    shortLabel: 'VON',
    subtitle: 'Estabilidade & Espírito',
    mechanicalImpact: 'Resistência a maldições, foco sob dano e força de bênçãos.',
  },
  {
    key: 'handling',
    label: 'Manejo',
    shortLabel: 'MAN',
    subtitle: 'Liderança & Empatia',
    mechanicalImpact: 'Limite de auxiliares/pets, adestramento e gestão de caravana.',
  },
] as const;

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

export const CHARACTER_ORIGINS: readonly CharacterOriginSpec[] = [
  {
    key: 'settler',
    label: 'Filho de Colono',
    startingRegionName: 'Planície dos Marcos',
    summary:
      'Largada em terras abertas férteis com kit rústico equivalente, sem bônus ou trava de classe.',
    startingHex: { q: 0, r: 0, z: 0 },
    starterKit: [
      {
        key: 'settler_garb',
        name: 'Túnica de Linho Rústica',
        category: 'outfit',
        quantity: 1,
        weightKg: 1.2,
        durabilityMax: 60,
      },
      ...SHARED_SURVIVAL_KIT,
    ],
  },
  {
    key: 'harbor',
    label: 'Aprendiz de Porto',
    startingRegionName: 'Enseada da Brisa',
    summary:
      'Largada em cais costeiro seguro com kit rústico equivalente, sem bônus ou trava de classe.',
    startingHex: { q: 4, r: -2, z: 0 },
    starterKit: [
      {
        key: 'harbor_garb',
        name: 'Casaco de Lona Costeira',
        category: 'outfit',
        quantity: 1,
        weightKg: 1.2,
        durabilityMax: 60,
      },
      ...SHARED_SURVIVAL_KIT,
    ],
  },
  {
    key: 'highlands',
    label: 'Andarilho das Montanhas',
    startingRegionName: 'Passo de Granito',
    summary:
      'Largada em platô elevado firme com kit rústico equivalente, sem bônus ou trava de classe.',
    startingHex: { q: -3, r: 4, z: 1 },
    starterKit: [
      {
        key: 'highlands_garb',
        name: 'Manto de Lã Serrana',
        category: 'outfit',
        quantity: 1,
        weightKg: 1.2,
        durabilityMax: 60,
      },
      ...SHARED_SURVIVAL_KIT,
    ],
  },
] as const;

export const ZERO_ATTRIBUTE_ALLOCATION: Readonly<CharacterAttributeAllocation> = {
  physique: 0,
  dexterity: 0,
  stamina: 0,
  magic: 0,
  perception: 0,
  willpower: 0,
  handling: 0,
};

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
    allocation: {
      physique: 2,
      dexterity: 2,
      stamina: 2,
      magic: 1,
      perception: 1,
      willpower: 1,
      handling: 1,
    },
  },
  {
    key: 'vanguard',
    label: 'Vanguarda',
    hint: 'Inclinação inicial para carga, resistência física e combate.',
    allocation: {
      physique: 3,
      dexterity: 2,
      stamina: 3,
      magic: 0,
      perception: 1,
      willpower: 1,
      handling: 0,
    },
  },
  {
    key: 'arcanist',
    label: 'Estudioso',
    hint: 'Inclinação inicial para canalização, percepção e manejo.',
    allocation: {
      physique: 0,
      dexterity: 1,
      stamina: 1,
      magic: 3,
      perception: 2,
      willpower: 2,
      handling: 1,
    },
  },
] as const;
