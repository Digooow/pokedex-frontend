export interface MuseumSpeciesRef {
  readonly id: number;
  readonly name: string;
  readonly displayName: string;
}

export interface RegionPreviewCard {
  readonly id: string;
  readonly name: string;
  readonly generation: string;
  readonly releaseYear: number;
  readonly platform: string;
  readonly flagshipGames: string;
  readonly visualEra: string;
  readonly starterQuery: string;
  readonly landmark: string;
  readonly arcadeSupported: boolean;
  readonly starters: readonly MuseumSpeciesRef[];
  readonly legendaries: readonly MuseumSpeciesRef[];
}

const ARTWORK_URL_PREFIX =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';

export function buildOfficialArtworkUrl(speciesId: number): string {
  return `${ARTWORK_URL_PREFIX}${speciesId}.png`;
}

export function isCanonicalAtlasRegion(id: string | null | undefined): boolean {
  const normalized = id?.trim().toLowerCase() ?? '';
  return REGIONS_ATLAS_PREVIEW.some((item) => item.id === normalized);
}

function sp(id: number, name: string, displayName: string): MuseumSpeciesRef {
  return { id, name, displayName };
}

export const REGIONS_ATLAS_PREVIEW: readonly RegionPreviewCard[] = [
  {
    id: 'kanto',
    name: 'Kanto',
    generation: 'Geração I (1996)',
    releaseYear: 1996,
    platform: 'Game Boy',
    flagshipGames: 'Red, Blue & Yellow',
    visualEra: 'Pixel art monocromática / 8-bit',
    starterQuery: 'bulbasaur',
    landmark: 'Indigo Plateau & Pallet Town',
    arcadeSupported: true,
    starters: [
      sp(1, 'bulbasaur', 'Bulbasaur'),
      sp(4, 'charmander', 'Charmander'),
      sp(7, 'squirtle', 'Squirtle'),
    ],
    legendaries: [sp(150, 'mewtwo', 'Mewtwo'), sp(144, 'articuno', 'Articuno')],
  },
  {
    id: 'johto',
    name: 'Johto',
    generation: 'Geração II (1999)',
    releaseYear: 1999,
    platform: 'Game Boy Color',
    flagshipGames: 'Gold, Silver & Crystal',
    visualEra: 'Sprites coloridos em 8-bit + ciclo dia/noite',
    starterQuery: 'chikorita',
    landmark: 'Bell Tower & Ecruteak',
    arcadeSupported: true,
    starters: [
      sp(152, 'chikorita', 'Chikorita'),
      sp(155, 'cyndaquil', 'Cyndaquil'),
      sp(158, 'totodile', 'Totodile'),
    ],
    legendaries: [sp(249, 'lugia', 'Lugia'), sp(250, 'ho-oh', 'Ho-Oh')],
  },
  {
    id: 'hoenn',
    name: 'Hoenn',
    generation: 'Geração III (2002)',
    releaseYear: 2002,
    platform: 'Game Boy Advance',
    flagshipGames: 'Ruby, Sapphire & Emerald',
    visualEra: 'Pixel art vibrante 16-bit + clima dinâmico',
    starterQuery: 'mudkip',
    landmark: 'Sootopolis & Sky Pillar',
    arcadeSupported: true,
    starters: [
      sp(252, 'treecko', 'Treecko'),
      sp(255, 'torchic', 'Torchic'),
      sp(258, 'mudkip', 'Mudkip'),
    ],
    legendaries: [sp(382, 'kyogre', 'Kyogre'), sp(384, 'rayquaza', 'Rayquaza')],
  },
  {
    id: 'sinnoh',
    name: 'Sinnoh',
    generation: 'Geração IV (2006)',
    releaseYear: 2006,
    platform: 'Nintendo DS',
    flagshipGames: 'Diamond, Pearl & Platinum',
    visualEra: 'Mundo 2.5D isométrico com sprites em duas telas',
    starterQuery: 'turtwig',
    landmark: 'Mt. Coronet & Spear Pillar',
    arcadeSupported: true,
    starters: [
      sp(387, 'turtwig', 'Turtwig'),
      sp(390, 'chimchar', 'Chimchar'),
      sp(393, 'piplup', 'Piplup'),
    ],
    legendaries: [sp(483, 'dialga', 'Dialga'), sp(487, 'giratina-altered', 'Giratina')],
  },
  {
    id: 'unova',
    name: 'Unova',
    generation: 'Geração V (2010)',
    releaseYear: 2010,
    platform: 'Nintendo DS',
    flagshipGames: 'Black, White & B2/W2',
    visualEra: 'Sprites animados em batalha + câmera dinâmica 2.5D',
    starterQuery: 'snivy',
    landmark: 'Castelia City & N’s Castle',
    arcadeSupported: false,
    starters: [
      sp(495, 'snivy', 'Snivy'),
      sp(498, 'tepig', 'Tepig'),
      sp(501, 'oshawott', 'Oshawott'),
    ],
    legendaries: [sp(643, 'reshiram', 'Reshiram'), sp(644, 'zekrom', 'Zekrom')],
  },
  {
    id: 'kalos',
    name: 'Kalos',
    generation: 'Geração VI (2013)',
    releaseYear: 2013,
    platform: 'Nintendo 3DS',
    flagshipGames: 'X & Y',
    visualEra: 'Transição integral para modelos 3D cel-shaded',
    starterQuery: 'chespin',
    landmark: 'Lumiose City & Prism Tower',
    arcadeSupported: false,
    starters: [
      sp(650, 'chespin', 'Chespin'),
      sp(653, 'fennekin', 'Fennekin'),
      sp(656, 'froakie', 'Froakie'),
    ],
    legendaries: [sp(716, 'xerneas', 'Xerneas'), sp(717, 'yveltal', 'Yveltal')],
  },
  {
    id: 'alola',
    name: 'Alola',
    generation: 'Geração VII (2016)',
    releaseYear: 2016,
    platform: 'Nintendo 3DS',
    flagshipGames: 'Sun, Moon & Ultra Sun/Moon',
    visualEra: 'Proporções reais em 3D sem grade rígida',
    starterQuery: 'rowlet',
    landmark: 'Mount Lanakila & Altar of the Sunne',
    arcadeSupported: false,
    starters: [
      sp(722, 'rowlet', 'Rowlet'),
      sp(725, 'litten', 'Litten'),
      sp(728, 'popplio', 'Popplio'),
    ],
    legendaries: [sp(791, 'solgaleo', 'Solgaleo'), sp(792, 'lunala', 'Lunala')],
  },
  {
    id: 'galar',
    name: 'Galar',
    generation: 'Geração VIII (2019)',
    releaseYear: 2019,
    platform: 'Nintendo Switch',
    flagshipGames: 'Sword & Shield',
    visualEra: 'HD em console + Wild Area com câmera livre',
    starterQuery: 'grookey',
    landmark: 'Wyndon Stadium & Slumbering Weald',
    arcadeSupported: false,
    starters: [
      sp(810, 'grookey', 'Grookey'),
      sp(813, 'scorbunny', 'Scorbunny'),
      sp(816, 'sobble', 'Sobble'),
    ],
    legendaries: [sp(888, 'zacian', 'Zacian'), sp(889, 'zamazenta', 'Zamazenta')],
  },
  {
    id: 'paldea',
    name: 'Paldea',
    generation: 'Geração IX (2022)',
    releaseYear: 2022,
    platform: 'Nintendo Switch',
    flagshipGames: 'Scarlet & Violet',
    visualEra: 'Mundo aberto contínuo com texturas PBR',
    starterQuery: 'sprigatito',
    landmark: 'Area Zero & Mesagoza',
    arcadeSupported: false,
    starters: [
      sp(906, 'sprigatito', 'Sprigatito'),
      sp(909, 'fuecoco', 'Fuecoco'),
      sp(912, 'quaxly', 'Quaxly'),
    ],
    legendaries: [sp(1007, 'koraidon', 'Koraidon'), sp(1008, 'miraidon', 'Miraidon')],
  },
];
