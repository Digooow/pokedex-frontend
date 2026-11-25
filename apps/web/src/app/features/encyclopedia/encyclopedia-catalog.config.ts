import type {
  AbilityDetail,
  BerryDetail,
  EggGroupDetail,
  EncyclopediaResourceKey,
  GrowthRateDetail,
  ItemDetail,
  LocationDetail,
  MoveDetail,
  NatureSummary,
  PokedexDetail,
  RegionDetail,
  TypeDetail,
} from '@pokeverse/shared/pokedex-encyclopedia';

export interface EncyclopediaCategoryConfig {
  readonly key: EncyclopediaResourceKey;
  readonly label: string;
  readonly endpointPath: string;
  readonly mode: 'paginated' | 'full-list';
  readonly description: string;
}

export const ENCYCLOPEDIA_CATEGORIES: readonly EncyclopediaCategoryConfig[] = [
  {
    key: 'move',
    label: 'Golpes',
    endpointPath: 'moves',
    mode: 'paginated',
    description: 'Poder, precisão, efeitos de combate e Pokémon que aprendem cada golpe.',
  },
  {
    key: 'ability',
    label: 'Habilidades',
    endpointPath: 'abilities',
    mode: 'paginated',
    description: 'Efeitos passivos em batalha/campo e espécies portadoras.',
  },
  {
    key: 'item',
    label: 'Itens',
    endpointPath: 'items',
    mode: 'paginated',
    description: 'Pedras evolutivas, held items, pokébolas e raridade em selvagens.',
  },
  {
    key: 'berry',
    label: 'Berries',
    endpointPath: 'berries',
    mode: 'paginated',
    description: 'Tempo de crescimento, firmeza, sabores e poder de Natural Gift.',
  },
  {
    key: 'type',
    label: 'Tipos',
    endpointPath: 'types',
    mode: 'full-list',
    description: 'Matriz elemental de vantagens, fraquezas e elenco por tipo.',
  },
  {
    key: 'nature',
    label: 'Naturezas',
    endpointPath: 'natures',
    mode: 'full-list',
    description: 'Modificadores de atributos (+10% / -10%) e preferência de sabor.',
  },
  {
    key: 'region',
    label: 'Regiões',
    endpointPath: 'regions',
    mode: 'paginated',
    description: 'Regiões oficiais, Pokédexes associadas e localidades exploráveis.',
  },
  {
    key: 'pokedex',
    label: 'Pokédexes',
    endpointPath: 'pokedexes',
    mode: 'paginated',
    description: 'Listagens regionais numeradas e espécies catalogadas.',
  },
  {
    key: 'location',
    label: 'Locais',
    endpointPath: 'locations',
    mode: 'paginated',
    description: 'Rotas, cidades, cavernas e áreas de encontro por região.',
  },
  {
    key: 'egg-group',
    label: 'Grupos de Ovo',
    endpointPath: 'egg-groups',
    mode: 'paginated',
    description: 'Compatibilidade genética para cruzamento e replicação.',
  },
  {
    key: 'growth-rate',
    label: 'Curvas de XP',
    endpointPath: 'growth-rates',
    mode: 'paginated',
    description: 'Progressão de experiência por nível e espécies por curva.',
  },
];

export const ENCYCLOPEDIA_CATEGORY_MAP: Readonly<
  Record<EncyclopediaResourceKey, EncyclopediaCategoryConfig>
> = Object.fromEntries(ENCYCLOPEDIA_CATEGORIES.map((item) => [item.key, item])) as Record<
  EncyclopediaResourceKey,
  EncyclopediaCategoryConfig
>;

export interface EncyclopediaListItemView {
  readonly id: number;
  readonly name: string;
  readonly displayName: string;
  readonly subtitle: string | null;
}

export interface EncyclopediaListView {
  readonly resource: EncyclopediaResourceKey;
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly hasMore: boolean;
  readonly items: readonly EncyclopediaListItemView[];
}

export type EncyclopediaDetailPayload =
  | { readonly kind: 'move'; readonly data: MoveDetail }
  | { readonly kind: 'ability'; readonly data: AbilityDetail }
  | { readonly kind: 'item'; readonly data: ItemDetail }
  | { readonly kind: 'berry'; readonly data: BerryDetail }
  | { readonly kind: 'region'; readonly data: RegionDetail }
  | { readonly kind: 'pokedex'; readonly data: PokedexDetail }
  | { readonly kind: 'location'; readonly data: LocationDetail }
  | { readonly kind: 'egg-group'; readonly data: EggGroupDetail }
  | { readonly kind: 'growth-rate'; readonly data: GrowthRateDetail }
  | { readonly kind: 'nature'; readonly data: NatureSummary }
  | { readonly kind: 'type'; readonly data: TypeDetail };
