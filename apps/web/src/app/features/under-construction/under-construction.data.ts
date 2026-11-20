export type UnderConstructionModuleId = 'overworld' | 'museum' | 'arcade' | 'arena';

export interface UnderConstructionModuleConfig {
  readonly id: UnderConstructionModuleId;
  readonly route: string;
  readonly tabLabel: string;
  readonly requiresTrainer: boolean;
  readonly badge: string;
  readonly title: string;
  readonly subtitle: string;
  readonly milestoneLabel: string;
  readonly progressPercent: number;
  readonly accentHue: 'amber' | 'sapphire' | 'crimson' | 'emerald';
  readonly pokemonId: number;
  readonly pokemonCode: string;
  readonly pokemonName: string;
  readonly pokemonQuery: string;
  readonly pokemonRole: string;
  readonly pokemonArtworkUrl: string;
  readonly pokemonFallbackUrl: string;
  readonly specs: readonly { readonly title: string; readonly detail: string }[];
}

export interface RegionPreviewCard {
  readonly id: string;
  readonly name: string;
  readonly generation: string;
  readonly starterQuery: string;
  readonly landmark: string;
}

export const UNDER_CONSTRUCTION_MODULES: Record<
  UnderConstructionModuleId,
  UnderConstructionModuleConfig
> = {
  overworld: {
    id: 'overworld',
    route: '/mundo',
    tabLabel: '1 Vila Central',
    requiresTrainer: true,
    badge: 'MÓDULO 01 · OVERWORLD 2D/HD-2D · EM DESENVOLVIMENTO',
    title: 'Vila Central — Funcionalidade ainda não implementada',
    subtitle:
      'Estamos construindo primeiro a Pokédex Suprema 3D com todos os 51 endpoints da PokéAPI para depois abrir as portas do mundo explorável em tempo real com treinadores online, clima e portais.',
    milestoneLabel: 'Previsão na Etapa 6 · Prioridade Atual: Pokédex Suprema',
    progressPercent: 18,
    accentHue: 'emerald',
    pokemonId: 149,
    pokemonCode: '#0149',
    pokemonName: 'Dragonite',
    pokemonQuery: 'dragonite',
    pokemonRole: 'Guardião & Mensageiro da Vila Central',
    pokemonArtworkUrl:
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/149.png',
    pokemonFallbackUrl:
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/149.png',
    specs: [
      { title: 'Motor Phaser 3 (60 FPS)', detail: 'Mapa 2D/HD-2D fluido com colisão e câmera tática.' },
      { title: 'Portais & Ciclo Dia/Noite', detail: 'Acesso físico ao Laboratório, Museu, Arcade e Arena.' },
      { title: 'Presença Multiplayer Live', detail: 'Movimentação sincronizada via WebSockets e Redis.' },
    ],
  },
  museum: {
    id: 'museum',
    route: '/museu',
    tabLabel: '3 Museu',
    requiresTrainer: false,
    badge: 'MÓDULO 03 · MUSEU DAS REGIÕES & LORE · EM CONSTRUÇÃO',
    title: 'Museu das Regiões — Funcionalidade em construção',
    subtitle:
      'O Atlas interativo em globo 3D (Three.js), acervo de Líderes de Ginásio, Elite Four e linha do tempo desde 1996 está em construção enquanto lapidamos a Pokédex Suprema. Abaixo você já pode explorar as regiões iniciais.',
    milestoneLabel: 'Base Enciclopédica Pronta · Globo 3D na Etapa 4B/6',
    progressPercent: 36,
    accentHue: 'amber',
    pokemonId: 151,
    pokemonCode: '#0151',
    pokemonName: 'Mew',
    pokemonQuery: 'mew',
    pokemonRole: 'Guardião Ancestral da História Pokémon',
    pokemonArtworkUrl:
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/151.png',
    pokemonFallbackUrl:
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/151.png',
    specs: [
      { title: 'Atlas de Kanto a Paldea', detail: 'Mapa interativo conectando regiões, rotas e habitats.' },
      { title: 'Líderes & Elite Four', detail: 'Equipes históricas, insígnias e lore de cada geração.' },
      { title: 'Linha do Tempo Completa', detail: 'Jogos, gerações, cartas TCG e arcos marcantes.' },
    ],
  },
  arcade: {
    id: 'arcade',
    route: '/arcade',
    tabLabel: '4 Arcade Retrô',
    requiresTrainer: true,
    badge: 'MÓDULO 04 · ARCADE RETRÔ WASM · EM DESENVOLVIMENTO',
    title: 'Arcade Retrô 3D — Funcionalidade ainda não implementada',
    subtitle:
      'O console portátil 3D com núcleo em WebAssembly e saves automáticos na nuvem entrará após concluirmos a Pokédex Suprema e os cálculos do Back-end. Seu acesso de treinador já está pronto para quando inaugurarmos!',
    milestoneLabel: 'Previsão na Etapa 6 · Emulação WASM + Cloud Saves',
    progressPercent: 14,
    accentHue: 'sapphire',
    pokemonId: 137,
    pokemonCode: '#0137',
    pokemonName: 'Porygon',
    pokemonQuery: 'porygon',
    pokemonRole: 'Arquiteto Virtual do Núcleo WebAssembly',
    pokemonArtworkUrl:
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/137.png',
    pokemonFallbackUrl:
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/137.png',
    specs: [
      { title: 'Console Portátil 3D', detail: 'Chassis skeuomórfico animado com tela shader retrô.' },
      { title: 'Core WebAssembly Nativo', detail: 'Execução estável sem travar a interface Angular.' },
      { title: 'Cloud Save States S3', detail: 'Progresso salvo em Object Storage e retomado em 1 clique.' },
    ],
  },
  arena: {
    id: 'arena',
    route: '/arena',
    tabLabel: '5 Battle Frontier',
    requiresTrainer: true,
    badge: 'MÓDULO 05 · BATTLE FRONTIER & LABORATÓRIO · EM DESENVOLVIMENTO',
    title: 'Battle Frontier — Funcionalidade ainda não implementada',
    subtitle:
      'A arena tática PvE/PvP e o Laboratório Genético (nível, chances de evolução, replicação, clonagem e aperfeiçoamento por capturas sem uso) já tiveram suas fórmulas modeladas em @pokeverse/shared e serão conectados logo após os 51 endpoints da Pokédex.',
    milestoneLabel: 'Fórmulas Modeladas em @pokeverse/shared · Endpoints na Etapa 5',
    progressPercent: 28,
    accentHue: 'crimson',
    pokemonId: 448,
    pokemonCode: '#0448',
    pokemonName: 'Lucario',
    pokemonQuery: 'lucario',
    pokemonRole: 'Mestre Tático da Battle Frontier',
    pokemonArtworkUrl:
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/448.png',
    pokemonFallbackUrl:
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/448.png',
    specs: [
      { title: 'Batalhas Autoritativas PvE/PvP', detail: 'Turnos validados no servidor com STAB e matriz 0x–4x.' },
      { title: 'Team Builder Competitivo', detail: 'Simulador completo de IVs, EVs, Natures e Movesets.' },
      { title: 'Laboratório de Ascensão', detail: 'Evolução, clonagem e reciclagem em Bio-Essência.' },
    ],
  },
};

export const UNDER_CONSTRUCTION_TABS: readonly UnderConstructionModuleConfig[] = [
  UNDER_CONSTRUCTION_MODULES.overworld,
  UNDER_CONSTRUCTION_MODULES.museum,
  UNDER_CONSTRUCTION_MODULES.arcade,
  UNDER_CONSTRUCTION_MODULES.arena,
];

export const REGIONS_ATLAS_PREVIEW: readonly RegionPreviewCard[] = [
  { id: 'kanto', name: 'Kanto', generation: 'Geração I (1996)', starterQuery: 'bulbasaur', landmark: 'Indigo Plateau & Pallet Town' },
  { id: 'johto', name: 'Johto', generation: 'Geração II (1999)', starterQuery: 'chikorita', landmark: 'Bell Tower & Ecruteak' },
  { id: 'hoenn', name: 'Hoenn', generation: 'Geração III (2002)', starterQuery: 'mudkip', landmark: 'Sootopolis & Sky Pillar' },
  { id: 'sinnoh', name: 'Sinnoh', generation: 'Geração IV (2006)', starterQuery: 'turtwig', landmark: 'Mt. Coronet & Spear Pillar' },
  { id: 'unova', name: 'Unova', generation: 'Geração V (2010)', starterQuery: 'snivy', landmark: 'Castelia City & N’s Castle' },
  { id: 'paldea', name: 'Paldea', generation: 'Geração IX (2022)', starterQuery: 'sprigatito', landmark: 'Area Zero & Mesagoza' },
];
