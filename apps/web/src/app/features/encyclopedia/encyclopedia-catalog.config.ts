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

function createCategory(
  key: EncyclopediaResourceKey,
  label: string,
  description: string,
  options?: {
    readonly endpointPath?: string;
    readonly mode?: 'paginated' | 'full-list';
  },
): EncyclopediaCategoryConfig {
  return {
    key,
    label,
    endpointPath: options?.endpointPath ?? `${key}s`,
    mode: options?.mode ?? 'paginated',
    description,
  };
}

export const ENCYCLOPEDIA_CATEGORIES: readonly EncyclopediaCategoryConfig[] = [
  createCategory(
    'move',
    'Golpes',
    'Poder, precisão, efeitos de combate e Pokémon que aprendem cada golpe.',
  ),
  createCategory(
    'ability',
    'Habilidades',
    'Efeitos passivos em batalha/campo e espécies portadoras.',
    { endpointPath: 'abilities' },
  ),
  createCategory(
    'item',
    'Itens',
    'Pedras evolutivas, held items, pokébolas e raridade em selvagens.',
  ),
  createCategory(
    'berry',
    'Berries',
    'Tempo de crescimento, firmeza, sabores e poder de Natural Gift.',
    { endpointPath: 'berries' },
  ),
  createCategory('type', 'Tipos', 'Matriz elemental de vantagens, fraquezas e elenco por tipo.', {
    mode: 'full-list',
  }),
  createCategory(
    'nature',
    'Naturezas',
    'Modificadores de atributos (+10% / -10%) e preferência de sabor.',
    { mode: 'full-list' },
  ),
  createCategory(
    'region',
    'Regiões & História',
    'Atlas histórico das 9 gerações canônicas (1996–2022), iniciais, lendários, Pokédexes regionais e localidades.',
  ),
  createCategory('pokedex', 'Pokédexes', 'Listagens regionais numeradas e espécies catalogadas.', {
    endpointPath: 'pokedexes',
  }),
  createCategory('location', 'Locais', 'Rotas, cidades, cavernas e áreas de encontro por região.'),
  createCategory(
    'egg-group',
    'Grupos de Ovo',
    'Compatibilidade genética para cruzamento e replicação.',
  ),
  createCategory(
    'growth-rate',
    'Curvas de XP',
    'Progressão de experiência por nível e espécies por curva.',
  ),
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
