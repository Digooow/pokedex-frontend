export const TOTAL_POKEDEX_SLOTS = 10;
export const MAX_CATALOG_RESULTS = 120;
export const MAX_TEAM_SIZE = 6;
export const MAX_EV_PER_STAT = 252;
export const MAX_EV_TOTAL = 510;

export const HEALTH_PROBE_TIMEOUT_MS = 1500;

export const POKEMON_TYPES = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
] as const;

export type PokemonTypeName = (typeof POKEMON_TYPES)[number];

export interface PlatformModuleMeta {
  readonly id: 'overworld' | 'pokedex' | 'museum' | 'arcade' | 'arena';
  readonly label: string;
  readonly route: string;
  readonly shortcut: '1' | '2' | '3' | '4' | '5';
  readonly requiresTrainer: boolean;
  readonly summary: string;
}

export const PLATFORM_MODULES: readonly PlatformModuleMeta[] = [
  {
    id: 'overworld',
    label: 'Vila Central',
    route: '/mundo',
    shortcut: '1',
    requiresTrainer: true,
    summary: 'Overworld 2D/HD-2D explorável em tempo real com portais e presença multiplayer.',
  },
  {
    id: 'pokedex',
    label: 'Pokédex 3D',
    route: '/pokedex',
    shortcut: '2',
    requiresTrainer: false,
    summary: 'Dispositivo de campo com busca fonética/Damerau-Levenshtein e dados da PokéAPI.',
  },
  {
    id: 'museum',
    label: 'Museu',
    route: '/museu',
    shortcut: '3',
    requiresTrainer: false,
    summary: 'Atlas das regiões de Kanto a Paldea, líderes de ginásio e linha do tempo.',
  },
  {
    id: 'arcade',
    label: 'Arcade Retrô',
    route: '/arcade',
    shortcut: '4',
    requiresTrainer: true,
    summary: 'Console portátil 3D em WebGL2 integrado a emulação WebAssembly e Cloud Saves.',
  },
  {
    id: 'arena',
    label: 'Battle Frontier',
    route: '/arena',
    shortcut: '5',
    requiresTrainer: true,
    summary: 'Team Builder competitivo, mini-games em tempo real e batalhas PvE/PvP.',
  },
] as const;
