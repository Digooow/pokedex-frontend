import { type PokemonTypeName, cleanComparisonText, formatPokeApiText } from '@pokeverse/shared';

export interface RegionFilterOption {
  readonly slug: string;
  readonly label: string;
  readonly generation: number;
}

export interface GameFilterOption {
  readonly id: string;
  readonly label: string;
  readonly pokedexSlug: string;
  readonly generation: number;
}

export interface QuickAttributePreset {
  readonly slug: string;
  readonly label: string;
}

export type AttributeShortcutKind = 'type' | 'region' | 'habitat' | 'eggGroup' | 'game';

export interface DetectedAttributeShortcut {
  readonly kind: AttributeShortcutKind;
  readonly value: string;
  readonly label: string;
}

export const POKEMON_TYPE_LABELS_PT: Readonly<Record<PokemonTypeName, string>> = {
  normal: 'Normal',
  fire: 'Fogo',
  water: 'Água',
  electric: 'Elétrico',
  grass: 'Planta',
  ice: 'Gelo',
  fighting: 'Lutador',
  poison: 'Veneno',
  ground: 'Terra',
  flying: 'Voador',
  psychic: 'Psíquico',
  bug: 'Inseto',
  rock: 'Pedra',
  ghost: 'Fantasma',
  dragon: 'Dragão',
  dark: 'Sombrio',
  steel: 'Aço',
  fairy: 'Fada',
};

export const EGG_GROUP_LABELS_PT: Readonly<Record<string, string>> = {
  monster: 'Monstro',
  dragon: 'Dragão',
  fairy: 'Fada',
  ground: 'Campo',
  field: 'Campo',
  bug: 'Inseto',
  flying: 'Voador',
  plant: 'Planta',
  grass: 'Planta',
  humanshape: 'Humanoide',
  'human-like': 'Humanoide',
  mineral: 'Mineral',
  indeterminate: 'Amorfo',
  amorphous: 'Amorfo',
  ditto: 'Ditto',
  water1: 'Água 1',
  water2: 'Água 2',
  water3: 'Água 3',
  'no-eggs': 'Sem Ovos',
};

export const HABITAT_LABELS_PT: Readonly<Record<string, string>> = {
  cave: 'Caverna',
  forest: 'Floresta',
  grassland: 'Campo Aberto',
  mountain: 'Montanha',
  rare: 'Raro',
  'rough-terrain': 'Terreno Áspero',
  sea: 'Mar',
  urban: 'Urbano',
  'waters-edge': 'Margem de Água',
};

export const REGION_FILTER_OPTIONS: readonly RegionFilterOption[] = [
  { slug: 'kanto', label: 'Kanto (Gen I)', generation: 1 },
  { slug: 'johto', label: 'Johto (Gen II)', generation: 2 },
  { slug: 'hoenn', label: 'Hoenn (Gen III)', generation: 3 },
  { slug: 'sinnoh', label: 'Sinnoh (Gen IV)', generation: 4 },
  { slug: 'unova', label: 'Unova (Gen V)', generation: 5 },
  { slug: 'kalos', label: 'Kalos (Gen VI)', generation: 6 },
  { slug: 'alola', label: 'Alola (Gen VII)', generation: 7 },
  { slug: 'galar', label: 'Galar (Gen VIII)', generation: 8 },
  { slug: 'hisui', label: 'Hisui (Gen VIII)', generation: 8 },
  { slug: 'paldea', label: 'Paldea (Gen IX)', generation: 9 },
];

export const GAME_FILTER_OPTIONS: readonly GameFilterOption[] = [
  { id: 'red-blue', label: 'Red / Blue / Yellow', pokedexSlug: 'kanto', generation: 1 },
  {
    id: 'gold-silver',
    label: 'Gold / Silver / Crystal',
    pokedexSlug: 'original-johto',
    generation: 2,
  },
  { id: 'ruby-sapphire', label: 'Ruby / Sapphire / Emerald', pokedexSlug: 'hoenn', generation: 3 },
  { id: 'firered-leafgreen', label: 'FireRed / LeafGreen', pokedexSlug: 'kanto', generation: 3 },
  { id: 'diamond-pearl', label: 'Diamond / Pearl', pokedexSlug: 'original-sinnoh', generation: 4 },
  { id: 'platinum', label: 'Platinum', pokedexSlug: 'extended-sinnoh', generation: 4 },
  {
    id: 'heartgold-soulsilver',
    label: 'HeartGold / SoulSilver',
    pokedexSlug: 'updated-johto',
    generation: 4,
  },
  { id: 'black-white', label: 'Black / White', pokedexSlug: 'original-unova', generation: 5 },
  { id: 'x-y', label: 'X / Y', pokedexSlug: 'kalos-central', generation: 6 },
  { id: 'sun-moon', label: 'Sun / Moon', pokedexSlug: 'original-alola', generation: 7 },
  { id: 'sword-shield', label: 'Sword / Shield', pokedexSlug: 'galar', generation: 8 },
  { id: 'legends-arceus', label: 'Legends: Arceus', pokedexSlug: 'hisui', generation: 8 },
  { id: 'scarlet-violet', label: 'Scarlet / Violet', pokedexSlug: 'paldea', generation: 9 },
];

export const QUICK_MOVE_PRESETS: readonly QuickAttributePreset[] = [
  { slug: 'thunderbolt', label: 'Thunderbolt' },
  { slug: 'flamethrower', label: 'Flamethrower' },
  { slug: 'surf', label: 'Surf' },
  { slug: 'earthquake', label: 'Earthquake' },
  { slug: 'ice-beam', label: 'Ice Beam' },
  { slug: 'psychic', label: 'Psychic' },
  { slug: 'dragon-claw', label: 'Dragon Claw' },
  { slug: 'shadow-ball', label: 'Shadow Ball' },
];

export const QUICK_ABILITY_PRESETS: readonly QuickAttributePreset[] = [
  { slug: 'static', label: 'Static' },
  { slug: 'intimidate', label: 'Intimidate' },
  { slug: 'levitate', label: 'Levitate' },
  { slug: 'overgrow', label: 'Overgrow' },
  { slug: 'blaze', label: 'Blaze' },
  { slug: 'torrent', label: 'Torrent' },
];

const SHORTCUT_INDEX: ReadonlyMap<string, DetectedAttributeShortcut> = buildShortcutIndex();

function addShortcutKeys(
  map: Map<string, DetectedAttributeShortcut>,
  shortcut: DetectedAttributeShortcut,
  aliases: readonly string[],
): void {
  for (const alias of aliases) {
    const key = cleanComparisonText(alias);
    if (key && !map.has(key)) {
      map.set(key, shortcut);
    }
  }
}

function buildShortcutIndex(): ReadonlyMap<string, DetectedAttributeShortcut> {
  const map = new Map<string, DetectedAttributeShortcut>();
  for (const [slug, ptLabel] of Object.entries(POKEMON_TYPE_LABELS_PT)) {
    addShortcutKeys(map, { kind: 'type', value: slug, label: `Elemento: ${ptLabel}` }, [
      slug,
      ptLabel,
    ]);
  }
  for (const region of REGION_FILTER_OPTIONS) {
    addShortcutKeys(map, { kind: 'region', value: region.slug, label: `Mapa: ${region.label}` }, [
      region.slug,
    ]);
  }
  for (const [slug, ptLabel] of Object.entries(HABITAT_LABELS_PT)) {
    addShortcutKeys(map, { kind: 'habitat', value: slug, label: `Habitat: ${ptLabel}` }, [
      slug,
      ptLabel,
    ]);
  }
  for (const [slug, ptLabel] of Object.entries(EGG_GROUP_LABELS_PT)) {
    addShortcutKeys(map, { kind: 'eggGroup', value: slug, label: `Raça: ${ptLabel}` }, [
      slug,
      ptLabel,
    ]);
  }
  for (const game of GAME_FILTER_OPTIONS) {
    addShortcutKeys(map, { kind: 'game', value: game.id, label: `Jogo: ${game.label}` }, [
      game.id,
      ...game.label.split('/'),
    ]);
  }
  return map;
}

export function formatTypeLabelPt(type: PokemonTypeName): string {
  return POKEMON_TYPE_LABELS_PT[type] ?? formatPokeApiText(type);
}

export function formatEggGroupLabelPt(slug: string): string {
  return EGG_GROUP_LABELS_PT[slug.toLowerCase()] ?? formatPokeApiText(slug);
}

export function formatHabitatLabelPt(slug: string): string {
  return HABITAT_LABELS_PT[slug.toLowerCase()] ?? formatPokeApiText(slug);
}

export function detectAttributeShortcut(rawQuery: string): DetectedAttributeShortcut | null {
  const key = cleanComparisonText(rawQuery);
  if (key.length < 3) return null;
  return SHORTCUT_INDEX.get(key) ?? null;
}

export function matchesAllowedSpeciesSet(itemName: string, allowed: ReadonlySet<string>): boolean {
  const normalized = itemName.toLowerCase();
  if (allowed.has(normalized)) return true;
  let idx = normalized.lastIndexOf('-');
  while (idx > 0) {
    if (allowed.has(normalized.slice(0, idx))) return true;
    idx = normalized.lastIndexOf('-', idx - 1);
  }
  return false;
}

export type FilterPanelTab = 'primary' | 'attributes' | 'taxonomy';

export const FILTER_TAB_ORDER: readonly FilterPanelTab[] = ['primary', 'attributes', 'taxonomy'];

export const DEFAULT_GENERATION_OPTIONS = Array.from({ length: 9 }, (_, idx) => ({
  id: idx + 1,
  name: `generation-${idx + 1}`,
  regionName: null as string | null,
}));

export function stepFilterTab(current: FilterPanelTab, key: string): FilterPanelTab | null {
  if (key === 'Home') return 'primary';
  if (key === 'End') return 'taxonomy';
  if (key !== 'ArrowRight' && key !== 'ArrowLeft') return null;
  const idx = FILTER_TAB_ORDER.indexOf(current);
  const step = key === 'ArrowRight' ? 1 : -1;
  return FILTER_TAB_ORDER[(idx + step + FILTER_TAB_ORDER.length) % FILTER_TAB_ORDER.length] ?? null;
}

export interface ActiveFilterSnapshot {
  readonly types: readonly PokemonTypeName[];
  readonly region: string | null;
  readonly game: string | null;
  readonly eggGroup: string | null;
  readonly moveFilter: string | null;
  readonly abilityFilter: string | null;
  readonly habitat: string | null;
}

export interface ActiveFilterChip {
  readonly key: string;
  readonly label: string;
}

export function buildActiveFilterChips(snap: ActiveFilterSnapshot): readonly ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = snap.types.map((type) => ({
    key: `type:${type}`,
    label: formatTypeLabelPt(type),
  }));
  if (snap.region) chips.push({ key: 'region', label: `Mapa: ${snap.region.toUpperCase()}` });
  if (snap.game) {
    const found = GAME_FILTER_OPTIONS.find((item) => item.id === snap.game);
    chips.push({ key: 'game', label: `Jogo: ${found?.label ?? snap.game}` });
  }
  if (snap.eggGroup) {
    chips.push({ key: 'eggGroup', label: `Raça: ${formatEggGroupLabelPt(snap.eggGroup)}` });
  }
  if (snap.moveFilter) chips.push({ key: 'move', label: `Golpe: ${snap.moveFilter}` });
  if (snap.abilityFilter) chips.push({ key: 'ability', label: `Hab.: ${snap.abilityFilter}` });
  if (snap.habitat) {
    chips.push({ key: 'habitat', label: `Habitat: ${formatHabitatLabelPt(snap.habitat)}` });
  }
  return chips;
}

export function countActiveFilters(
  snap: ActiveFilterSnapshot & {
    readonly types: readonly PokemonTypeName[];
    readonly generation: number | null;
    readonly color: string | null;
    readonly shape: string | null;
    readonly onlyLegendary: boolean;
    readonly onlyMythical: boolean;
    readonly onlyBaby: boolean;
    readonly excludeAlternateForms: boolean;
    readonly minBst: number;
  },
): number {
  const scalarFlags = [
    snap.generation !== null,
    snap.region !== null,
    snap.game !== null,
    snap.eggGroup !== null,
    snap.moveFilter !== null,
    snap.abilityFilter !== null,
    snap.habitat !== null,
    snap.color !== null,
    snap.shape !== null,
    snap.onlyLegendary,
    snap.onlyMythical,
    snap.onlyBaby,
    snap.excludeAlternateForms,
    snap.minBst > 0,
  ];
  return snap.types.length + scalarFlags.filter(Boolean).length;
}

export function createFilterErrorState(code: string, message: string) {
  return { status: 'error' as const, error: { code, message, retryable: true } };
}
