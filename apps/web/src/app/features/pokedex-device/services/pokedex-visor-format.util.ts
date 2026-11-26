import {
  type EvolutionChainNode,
  type EvolutionDetail,
  type PokemonBundle,
  type PokemonSpeciesSummary,
  formatPokeApiText,
} from '@pokeverse/shared';
import type { PokemonDetailView } from './pokedex-view-mapper.util';

export type VisorModeId = 'ficha' | 'holocron' | 'comparar' | 'calculadora' | 'enciclopedia';

export interface VisorModeMeta {
  readonly id: VisorModeId;
  readonly label: string;
  readonly shortLabel: string;
}

export const VISOR_MODES: readonly VisorModeMeta[] = [
  { id: 'ficha', label: 'Ficha do Pokémon', shortLabel: 'Ficha' },
  { id: 'holocron', label: 'Holocron 3D', shortLabel: '3D' },
  { id: 'comparar', label: 'Comparador 1v1', shortLabel: '1v1' },
  { id: 'calculadora', label: 'Calculadora de Atributos', shortLabel: 'Calc' },
  { id: 'enciclopedia', label: 'Enciclopédia Global', shortLabel: 'Enciclo' },
];

export function parseVisorModeId(raw: string | null | undefined): VisorModeId | null {
  const normalized = raw?.trim().toLowerCase() ?? '';
  return VISOR_MODES.find((entry) => entry.id === normalized)?.id ?? null;
}

export function parsePokedexRouteIntent(
  getParam: (name: string) => string | null,
  defaultCoverOpen: boolean | null,
) {
  const query = getParam('q')?.trim() ?? '';
  const mode = parseVisorModeId(getParam('mode'));
  const cat = getParam('cat')?.trim() || null;
  const item = getParam('item')?.trim() || null;
  const shouldOpen = Boolean(query || mode) || Boolean(defaultCoverOpen);
  return { query, mode, cat, item, shouldOpen, hasDefault: defaultCoverOpen !== null };
}

export type VisorTabId = 'resumo' | 'stats' | 'evolucao' | 'golpes' | 'mapa';

export interface VisorTabMeta {
  readonly id: VisorTabId;
  readonly label: string;
  readonly shortLabel: string;
}

export const VISOR_TABS: readonly VisorTabMeta[] = [
  { id: 'resumo', label: 'Resumo & Lore', shortLabel: 'Resumo' },
  { id: 'stats', label: 'Atributos & Tipos', shortLabel: 'Stats' },
  { id: 'evolucao', label: 'Evolução & Formas', shortLabel: 'Evolução' },
  { id: 'golpes', label: 'Golpes & Itens', shortLabel: 'Golpes' },
  { id: 'mapa', label: 'Mapa & Sprites', shortLabel: 'Mapa' },
];

export type VisorSpriteMode = 'artwork' | 'home' | 'showdown';
export type MoveLearnMethodTab = 'level-up' | 'machine' | 'egg' | 'tutor';

export interface GroupedPokemonMove {
  readonly name: string;
  readonly displayName: string;
  readonly levelLearnedAt: number;
}

export interface FlattenedEvolutionNode {
  readonly speciesId: number;
  readonly speciesName: string;
  readonly displayName: string;
  readonly artworkUrl: string;
  readonly depth: number;
  readonly isBaby: boolean;
  readonly conditionText: string;
}

const STAT_LABEL_MAP: Readonly<Record<string, string>> = {
  hp: 'HP',
  attack: 'Atk',
  defense: 'Def',
  'special-attack': 'SpA',
  'special-defense': 'SpD',
  speed: 'Spe',
};

const ARTWORK_URL_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';

function pickPrimarySpriteForMode(
  sprites: NonNullable<PokemonDetailView['bundle']>['pokemon']['sprites'],
  mode: VisorSpriteMode,
  shiny: boolean,
): string | null {
  if (mode === 'showdown') {
    return shiny ? sprites.showdown.frontShiny : sprites.showdown.frontDefault;
  }
  if (mode === 'home') {
    return shiny ? sprites.home.frontShiny : sprites.home.frontDefault;
  }
  if (shiny) {
    return sprites.officialArtwork.frontShiny ?? sprites.officialArtwork.frontDefault;
  }
  return sprites.officialArtwork.frontDefault;
}

export function resolveVisorSpriteUrl(
  pokemon: PokemonDetailView,
  mode: VisorSpriteMode,
  shiny: boolean,
  isLite: boolean,
): { readonly primary: string | null; readonly fallback: string | null } {
  const sprites = pokemon.bundle?.pokemon.sprites;
  if (!sprites) {
    return { primary: pokemon.spriteUrl, fallback: pokemon.fallbackSpriteUrl };
  }

  const effectiveMode: VisorSpriteMode = isLite && mode === 'showdown' ? 'artwork' : mode;
  const fallback = shiny
    ? (sprites.default.frontShiny ?? sprites.default.frontDefault)
    : (sprites.default.frontDefault ?? pokemon.fallbackSpriteUrl);
  const primary = pickPrimarySpriteForMode(sprites, effectiveMode, shiny);
  const resolvedPrimary =
    effectiveMode === 'artwork' ? (primary ?? fallback) : (primary ?? pokemon.spriteUrl);
  return { primary: resolvedPrimary, fallback };
}

export function hasShinySprite(pokemon: PokemonDetailView): boolean {
  const sprites = pokemon.bundle?.pokemon.sprites;
  if (!sprites) return false;
  return Boolean(
    sprites.officialArtwork.frontShiny ||
    sprites.home.frontShiny ||
    sprites.showdown.frontShiny ||
    sprites.default.frontShiny,
  );
}

export function hasHomeSprite(pokemon: PokemonDetailView): boolean {
  const sprites = pokemon.bundle?.pokemon.sprites;
  return Boolean(sprites && (sprites.home.frontDefault || sprites.home.frontShiny));
}

export function hasShowdownSprite(pokemon: PokemonDetailView): boolean {
  const sprites = pokemon.bundle?.pokemon.sprites;
  return Boolean(sprites && (sprites.showdown.frontDefault || sprites.showdown.frontShiny));
}

export function pickLocalizedFlavorEntry(
  species: PokemonSpeciesSummary,
): { readonly text: string; readonly version: string } | null {
  if (species.flavorTexts.length === 0) return null;
  const preferred =
    species.flavorTexts.find((entry) => entry.language === 'pt-br' || entry.language === 'pt') ??
    species.flavorTexts.find((entry) => entry.language === 'en') ??
    species.flavorTexts[0];
  if (!preferred) return null;
  const cleanText = preferred.text
    .replace(/[\f\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { text: cleanText, version: formatPokeApiText(preferred.version) };
}

export function formatGenderRatio(genderRate: number): string {
  if (genderRate < 0) return 'Sem gênero';
  if (genderRate === 0) return '100% Macho';
  if (genderRate === 8) return '100% Fêmea';
  const femalePct = Math.round((genderRate / 8) * 1000) / 10;
  const malePct = Math.round((100 - femalePct) * 10) / 10;
  return `${malePct}% Macho / ${femalePct}% Fêmea`;
}

function describeSingleEvolutionDetail(detail: EvolutionDetail): string {
  const parts: string[] = [];
  if (detail.minLevel !== null) parts.push(`Nv. ${detail.minLevel}`);
  if (detail.item) parts.push(`Item: ${formatPokeApiText(detail.item)}`);
  if (detail.heldItem) parts.push(`Segurando ${formatPokeApiText(detail.heldItem)}`);
  if (detail.minHappiness !== null) parts.push(`Amizade ${detail.minHappiness}+`);
  if (detail.minAffection !== null) parts.push(`Afeto ${detail.minAffection}+`);
  if (detail.timeOfDay) parts.push(detail.timeOfDay === 'day' ? 'De dia' : 'À noite');
  if (detail.needsOverworldRain) parts.push('Na chuva');
  if (detail.location) parts.push(`Local: ${formatPokeApiText(detail.location)}`);
  if (detail.knownMove) parts.push(`Golpe: ${formatPokeApiText(detail.knownMove)}`);
  if (detail.knownMoveType) parts.push(`Golpe ${formatPokeApiText(detail.knownMoveType)}`);
  if (detail.tradeSpecies) parts.push(`Troca por ${formatPokeApiText(detail.tradeSpecies)}`);
  if (detail.turnUpsideDown) parts.push('Virar console');
  if (parts.length > 0) return parts.join(' · ');
  return formatPokeApiText(detail.trigger);
}

export function formatEvolutionConditions(details: readonly EvolutionDetail[]): string {
  if (details.length === 0) return 'Forma base';
  return details.map((detail) => describeSingleEvolutionDetail(detail)).join(' ou ');
}

export function flattenEvolutionTree(root: EvolutionChainNode): readonly FlattenedEvolutionNode[] {
  const nodes: FlattenedEvolutionNode[] = [];
  const visit = (node: EvolutionChainNode, depth: number): void => {
    nodes.push({
      speciesId: node.speciesId,
      speciesName: node.speciesName.toLowerCase(),
      displayName: formatPokeApiText(node.speciesName),
      artworkUrl: `${ARTWORK_URL_BASE}${node.speciesId}.png`,
      depth,
      isBaby: node.isBaby,
      conditionText: depth === 0 ? 'Forma base' : formatEvolutionConditions(node.evolutionDetails),
    });
    for (const child of node.evolvesTo) {
      visit(child, depth + 1);
    }
  };
  visit(root, 0);
  return nodes;
}

export function groupMovesByLearnMethod(
  moves: PokemonBundle['pokemon']['moves'],
): Readonly<Record<MoveLearnMethodTab, readonly GroupedPokemonMove[]>> {
  const buckets: Record<MoveLearnMethodTab, Map<string, number>> = {
    'level-up': new Map(),
    machine: new Map(),
    egg: new Map(),
    tutor: new Map(),
  };

  for (const move of moves) {
    for (const detail of move.versionGroupDetails) {
      const method = detail.learnMethod as MoveLearnMethodTab;
      if (!(method in buckets)) continue;
      const prev = buckets[method].get(move.name);
      if (prev === undefined || (method === 'level-up' && detail.levelLearnedAt < prev)) {
        buckets[method].set(move.name, detail.levelLearnedAt);
      }
    }
  }

  const toSortedList = (method: MoveLearnMethodTab): readonly GroupedPokemonMove[] => {
    const entries = Array.from(buckets[method].entries()).map(([name, levelLearnedAt]) => ({
      name,
      displayName: formatPokeApiText(name),
      levelLearnedAt,
    }));
    if (method === 'level-up') {
      entries.sort(
        (a, b) => a.levelLearnedAt - b.levelLearnedAt || a.displayName.localeCompare(b.displayName),
      );
    } else {
      entries.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }
    return entries;
  };

  return {
    'level-up': toSortedList('level-up'),
    machine: toSortedList('machine'),
    egg: toSortedList('egg'),
    tutor: toSortedList('tutor'),
  };
}

export function translateStatName(raw: string): string {
  const key = raw.toLowerCase();
  return STAT_LABEL_MAP[key] ?? formatPokeApiText(raw);
}

export function computeStatBarPercent(value: number): number {
  return Math.max(4, Math.min(100, Math.round((value / 255) * 100)));
}

export function resolveStatTier(value: number): 'low' | 'mid' | 'high' | 'apex' {
  if (value >= 120) return 'apex';
  if (value >= 90) return 'high';
  if (value >= 60) return 'mid';
  return 'low';
}
