export interface RegionPreviewCard {
  readonly id: string;
  readonly name: string;
  readonly generation: string;
  readonly starterQuery: string;
  readonly landmark: string;
}

function regionCard(
  id: string,
  name: string,
  generation: string,
  starterQuery: string,
  landmark: string,
): RegionPreviewCard {
  return { id, name, generation, starterQuery, landmark };
}

export const REGIONS_ATLAS_PREVIEW: readonly RegionPreviewCard[] = [
  regionCard('kanto', 'Kanto', 'Geração I (1996)', 'bulbasaur', 'Indigo Plateau & Pallet Town'),
  regionCard('johto', 'Johto', 'Geração II (1999)', 'chikorita', 'Bell Tower & Ecruteak'),
  regionCard('hoenn', 'Hoenn', 'Geração III (2002)', 'mudkip', 'Sootopolis & Sky Pillar'),
  regionCard('sinnoh', 'Sinnoh', 'Geração IV (2006)', 'turtwig', 'Mt. Coronet & Spear Pillar'),
  regionCard('unova', 'Unova', 'Geração V (2010)', 'snivy', 'Castelia City & N’s Castle'),
  regionCard('paldea', 'Paldea', 'Geração IX (2022)', 'sprigatito', 'Area Zero & Mesagoza'),
];
