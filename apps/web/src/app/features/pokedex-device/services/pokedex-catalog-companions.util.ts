import type {
  CatalogMatchItem,
  EnrichedCatalogItem,
  SearchablePokemonItem,
} from '@pokeverse/shared';
import type { PokemonDetailView } from './pokedex-view-mapper.util';
import { flattenEvolutionTree } from './pokedex-visor-format.util';

export const MIN_VISIBLE_CATALOG_ITEMS = 8;

export interface CatalogDisplayEntry extends CatalogMatchItem {
  readonly isCompanion: boolean;
  readonly relationLabel: string | null;
}

export interface CatalogDisplayList {
  readonly primaryCount: number;
  readonly companionCount: number;
  readonly items: readonly CatalogDisplayEntry[];
}

export interface BuildCatalogDisplayParams {
  readonly primaryItems: readonly CatalogMatchItem[];
  readonly fullCatalog: readonly SearchablePokemonItem[];
  readonly enrichedCatalog: readonly EnrichedCatalogItem[];
  readonly selectedPokemon: PokemonDetailView | null;
  readonly minItems?: number;
}

function toPrimaryEntry(item: CatalogMatchItem): CatalogDisplayEntry {
  return { ...item, isCompanion: false, relationLabel: null };
}

function toCompanionEntry(item: SearchablePokemonItem, relationLabel: string): CatalogDisplayEntry {
  return {
    ...item,
    score: 900 + item.id,
    approximate: false,
    isCompanion: true,
    relationLabel,
  };
}

function appendEvolutionCompanions(
  anchor: CatalogMatchItem,
  selectedPokemon: PokemonDetailView | null,
  catalogByName: ReadonlyMap<string, SearchablePokemonItem>,
  seenIds: Set<number>,
  companions: CatalogDisplayEntry[],
  targetCompanions: number,
): void {
  const chain = selectedPokemon?.bundle?.evolutionChain;
  if (!chain || companions.length >= targetCompanions) return;

  const nodes = flattenEvolutionTree(chain.root);
  const anchorInChain = nodes.some(
    (node) => node.speciesId === anchor.id || node.speciesName === anchor.name,
  );
  if (!anchorInChain) return;

  for (const node of nodes) {
    if (companions.length >= targetCompanions) break;
    const match = catalogByName.get(node.speciesName);
    if (!match || seenIds.has(match.id)) continue;
    seenIds.add(match.id);
    companions.push(toCompanionEntry(match, 'Evolução'));
  }
}

function appendSameTypeCompanions(
  anchor: CatalogMatchItem,
  enrichedCatalog: readonly EnrichedCatalogItem[],
  seenIds: Set<number>,
  companions: CatalogDisplayEntry[],
  targetCompanions: number,
): void {
  if (enrichedCatalog.length === 0 || companions.length >= targetCompanions) return;
  const enrichedById = new Map<number, EnrichedCatalogItem>();
  for (const entry of enrichedCatalog) {
    enrichedById.set(entry.id, entry);
  }
  const anchorEnriched = enrichedById.get(anchor.id);
  const anchorTypes = anchorEnriched?.types ?? [];
  if (anchorTypes.length === 0) return;

  const anchorTypeSet = new Set<string>(anchorTypes);
  const anchorGen = anchorEnriched?.generation ?? 0;
  const candidates = enrichedCatalog
    .filter(
      (entry) => !seenIds.has(entry.id) && (entry.types ?? []).some((t) => anchorTypeSet.has(t)),
    )
    .sort((a, b) => {
      const aGenDiff = anchorGen > 0 ? Math.abs((a.generation ?? 99) - anchorGen) : 0;
      const bGenDiff = anchorGen > 0 ? Math.abs((b.generation ?? 99) - anchorGen) : 0;
      return aGenDiff - bGenDiff || Math.abs(a.id - anchor.id) - Math.abs(b.id - anchor.id);
    });

  for (const candidate of candidates) {
    if (companions.length >= targetCompanions) break;
    seenIds.add(candidate.id);
    companions.push(toCompanionEntry(candidate, 'Mesmo tipo'));
  }
}

function appendNeighborCompanions(
  anchor: CatalogMatchItem,
  fullCatalog: readonly SearchablePokemonItem[],
  seenIds: Set<number>,
  companions: CatalogDisplayEntry[],
  targetCompanions: number,
): void {
  if (companions.length >= targetCompanions) return;
  const sortedNeighbors = [...fullCatalog]
    .filter((entry) => !seenIds.has(entry.id))
    .sort((a, b) => Math.abs(a.id - anchor.id) - Math.abs(b.id - anchor.id) || a.id - b.id);

  for (const neighbor of sortedNeighbors) {
    if (companions.length >= targetCompanions) break;
    seenIds.add(neighbor.id);
    companions.push(toCompanionEntry(neighbor, 'Próximo'));
  }
}

export function buildCatalogDisplayList(params: BuildCatalogDisplayParams): CatalogDisplayList {
  const { primaryItems, fullCatalog, enrichedCatalog, selectedPokemon } = params;
  const minItems = params.minItems ?? MIN_VISIBLE_CATALOG_ITEMS;

  if (primaryItems.length === 0) {
    return { primaryCount: 0, companionCount: 0, items: [] };
  }

  const primaryEntries = primaryItems.map((item) => toPrimaryEntry(item));
  const needsCompanions =
    fullCatalog.length > primaryItems.length &&
    (primaryItems.length === 1 ||
      (primaryItems.length < minItems && fullCatalog.length >= minItems));

  if (!needsCompanions) {
    return {
      primaryCount: primaryEntries.length,
      companionCount: 0,
      items: primaryEntries,
    };
  }

  const targetTotal = Math.min(fullCatalog.length, minItems);
  const targetCompanions = Math.max(0, targetTotal - primaryEntries.length);
  const anchor = primaryItems[0];
  if (!anchor || targetCompanions === 0) {
    return { primaryCount: primaryEntries.length, companionCount: 0, items: primaryEntries };
  }

  const seenIds = new Set<number>(primaryItems.map((item) => item.id));
  const catalogByName = new Map<string, SearchablePokemonItem>();
  for (const item of fullCatalog) {
    catalogByName.set(item.name, item);
  }

  const companions: CatalogDisplayEntry[] = [];
  appendEvolutionCompanions(
    anchor,
    selectedPokemon,
    catalogByName,
    seenIds,
    companions,
    targetCompanions,
  );
  appendSameTypeCompanions(anchor, enrichedCatalog, seenIds, companions, targetCompanions);
  appendNeighborCompanions(anchor, fullCatalog, seenIds, companions, targetCompanions);

  return {
    primaryCount: primaryEntries.length,
    companionCount: companions.length,
    items: [...primaryEntries, ...companions],
  };
}
