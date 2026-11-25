import { formatPokeApiText } from '@pokeverse/shared';
import type {
  EncyclopediaPokemonRef,
  EncyclopediaResourceKey,
  LocalizedFlavorEntry,
} from '@pokeverse/shared/pokedex-encyclopedia';
import type { EncyclopediaDetailPayload } from './encyclopedia-catalog.config';

export interface PresentedMetric {
  readonly label: string;
  readonly value: string;
}

export interface PresentedReversePokemon {
  readonly pokemonId: number;
  readonly pokemonName: string;
  readonly displayName: string;
  readonly artworkUrl: string;
  readonly tag: string | null;
}

export interface PresentedRelatedLink {
  readonly category: EncyclopediaResourceKey;
  readonly name: string;
  readonly label: string;
}

export interface PresentedEncyclopediaDetail {
  readonly id: number;
  readonly title: string;
  readonly subtitle: string;
  readonly spriteUrl: string | null;
  readonly badges: readonly string[];
  readonly metrics: readonly PresentedMetric[];
  readonly description: string | null;
  readonly relatedTitle: string | null;
  readonly relatedLinks: readonly PresentedRelatedLink[];
  readonly reversePokemonTitle: string | null;
  readonly reversePokemon: readonly PresentedReversePokemon[];
}

function pickLocalizedText(entries: readonly LocalizedFlavorEntry[]): string | null {
  const preferred =
    entries.find((e) => e.language === 'pt-br' || e.language === 'pt') ??
    entries.find((e) => e.language === 'en') ??
    entries[0];
  return preferred ? preferred.text.replace(/[\f\n\r]+/g, ' ').trim() : null;
}

function mapPokemonRefs(
  refs: readonly EncyclopediaPokemonRef[],
  tagBuilder?: (idx: number) => string | null,
): readonly PresentedReversePokemon[] {
  return refs.map((ref, idx) => ({
    pokemonId: ref.pokemonId,
    pokemonName: ref.pokemonName,
    displayName: formatPokeApiText(ref.pokemonName),
    artworkUrl: ref.artworkUrl,
    tag: tagBuilder ? tagBuilder(idx) : null,
  }));
}

type DetailPresenter<K extends EncyclopediaDetailPayload['kind']> = (
  data: Extract<EncyclopediaDetailPayload, { readonly kind: K }>['data'],
) => PresentedEncyclopediaDetail;

const PRESENTERS: { [K in EncyclopediaDetailPayload['kind']]: DetailPresenter<K> } = {
  move: (d) => ({
    id: d.id,
    title: formatPokeApiText(d.name),
    subtitle: `Golpe · Tipo ${formatPokeApiText(d.type)}`,
    spriteUrl: null,
    badges: [
      formatPokeApiText(d.type),
      d.damageClass ? formatPokeApiText(d.damageClass) : 'Status',
      d.generation ? formatPokeApiText(d.generation) : 'Geração N/A',
    ],
    metrics: [
      { label: 'Poder', value: d.power !== null ? String(d.power) : '—' },
      { label: 'Precisão', value: d.accuracy !== null ? `${d.accuracy}%` : '—' },
      { label: 'PP', value: d.pp !== null ? String(d.pp) : '—' },
      { label: 'Prioridade', value: String(d.priority) },
    ],
    description: d.shortEffect ?? d.effect ?? pickLocalizedText(d.flavorTexts),
    relatedTitle: null,
    relatedLinks: [],
    reversePokemonTitle: 'Pokémon que aprendem este golpe',
    reversePokemon: mapPokemonRefs(d.learnedByPokemon),
  }),
  ability: (d) => ({
    id: d.id,
    title: formatPokeApiText(d.name),
    subtitle: d.isMainSeries ? 'Habilidade · Série principal' : 'Habilidade · Spin-off',
    spriteUrl: null,
    badges: [d.generation ? formatPokeApiText(d.generation) : 'Geração N/A'],
    metrics: [{ label: 'Portadores', value: String(d.pokemon.length) }],
    description: d.shortEffect ?? d.effect ?? pickLocalizedText(d.flavorTexts),
    relatedTitle: null,
    relatedLinks: [],
    reversePokemonTitle: 'Pokémon com esta habilidade',
    reversePokemon: mapPokemonRefs(d.pokemon, (idx) => {
      const entry = d.pokemon[idx];
      return entry?.isHidden ? 'Oculta' : `Slot ${entry?.slot ?? 1}`;
    }),
  }),
  item: (d) => ({
    id: d.id,
    title: formatPokeApiText(d.name),
    subtitle: d.category ? `Item · ${formatPokeApiText(d.category)}` : 'Item',
    spriteUrl: d.spriteUrl,
    badges: d.attributes.map(formatPokeApiText),
    metrics: [
      { label: 'Custo', value: `${d.cost} ₽` },
      { label: 'Fling', value: d.flingPower !== null ? String(d.flingPower) : '—' },
    ],
    description: d.shortEffect ?? d.effect ?? pickLocalizedText(d.flavorTexts),
    relatedTitle: null,
    relatedLinks: [],
    reversePokemonTitle: 'Pokémon que seguram este item',
    reversePokemon: mapPokemonRefs(d.heldByPokemon, (idx) => {
      const entry = d.heldByPokemon[idx];
      return entry ? `Raridade ${entry.maxRarity}%` : null;
    }),
  }),
  berry: (d) => ({
    id: d.id,
    title: `${formatPokeApiText(d.name)} Berry`,
    subtitle: d.firmness ? `Firmeza: ${formatPokeApiText(d.firmness)}` : 'Berry',
    spriteUrl: null,
    badges: d.flavors
      .filter((f) => f.potency > 0)
      .map((f) => `${formatPokeApiText(f.flavor)} (${f.potency})`),
    metrics: [
      { label: 'Crescimento', value: `${d.growthTime}h` },
      { label: 'Colheita máx.', value: String(d.maxHarvest) },
      { label: 'Natural Gift', value: `${d.naturalGiftPower}` },
      { label: 'Tamanho', value: `${d.sizeMm} mm` },
    ],
    description: d.naturalGiftType
      ? `Tipo de Natural Gift: ${formatPokeApiText(d.naturalGiftType)}. Secagem do solo: ${d.soilDryness}.`
      : null,
    relatedTitle: 'Item associado',
    relatedLinks: [{ category: 'item', name: d.itemName, label: formatPokeApiText(d.itemName) }],
    reversePokemonTitle: null,
    reversePokemon: [],
  }),
  region: (d) => ({
    id: d.id,
    title: formatPokeApiText(d.name),
    subtitle: d.mainGeneration
      ? `Região · ${formatPokeApiText(d.mainGeneration)}`
      : 'Região Pokémon',
    spriteUrl: null,
    badges: d.versionGroups.map(formatPokeApiText),
    metrics: [
      { label: 'Pokédexes', value: String(d.pokedexes.length) },
      { label: 'Localidades', value: String(d.locations.length) },
    ],
    description: null,
    relatedTitle: 'Pokédexes e locais da região',
    relatedLinks: [
      ...d.pokedexes.map((p) => ({
        category: 'pokedex' as const,
        name: p.name,
        label: `Pokédex: ${formatPokeApiText(p.name)}`,
      })),
      ...d.locations.slice(0, 18).map((loc) => ({
        category: 'location' as const,
        name: loc.name,
        label: formatPokeApiText(loc.name),
      })),
    ],
    reversePokemonTitle: null,
    reversePokemon: [],
  }),
  pokedex: (d) => ({
    id: d.id,
    title: formatPokeApiText(d.name),
    subtitle: d.region ? `Pokédex de ${formatPokeApiText(d.region)}` : 'Pokédex Nacional/Regional',
    spriteUrl: null,
    badges: d.versionGroups.map(formatPokeApiText),
    metrics: [{ label: 'Entradas', value: String(d.totalEntries) }],
    description: d.description,
    relatedTitle: null,
    relatedLinks: [],
    reversePokemonTitle: 'Espécies catalogadas nesta Pokédex',
    reversePokemon: d.entries.map((e) => ({
      pokemonId: e.speciesId,
      pokemonName: e.speciesName,
      displayName: formatPokeApiText(e.speciesName),
      artworkUrl: e.artworkUrl,
      tag: `#${String(e.entryNumber).padStart(3, '0')}`,
    })),
  }),
  location: (d) => ({
    id: d.id,
    title: d.localizedName ?? formatPokeApiText(d.name),
    subtitle: d.region ? `Região: ${formatPokeApiText(d.region)}` : 'Localidade',
    spriteUrl: null,
    badges: d.generations.map(formatPokeApiText),
    metrics: [{ label: 'Áreas', value: String(d.areas.length) }],
    description:
      d.areas.length > 0
        ? `Subáreas mapeadas: ${d.areas.map((a) => formatPokeApiText(a.name)).join(', ')}.`
        : 'Nenhuma subárea listada.',
    relatedTitle: d.region ? 'Região pai' : null,
    relatedLinks: d.region
      ? [{ category: 'region', name: d.region, label: formatPokeApiText(d.region) }]
      : [],
    reversePokemonTitle: null,
    reversePokemon: [],
  }),
  'egg-group': (d) => ({
    id: d.id,
    title: formatPokeApiText(d.name),
    subtitle: 'Grupo de Ovo · Compatibilidade Genética',
    spriteUrl: null,
    badges: [],
    metrics: [{ label: 'Espécies', value: String(d.speciesCount) }],
    description: 'Espécies compatíveis para cruzamento e cálculo de ovos no Laboratório.',
    relatedTitle: null,
    relatedLinks: [],
    reversePokemonTitle: 'Espécies deste grupo de ovo',
    reversePokemon: mapPokemonRefs(d.pokemonSpecies),
  }),
  'growth-rate': (d) => ({
    id: d.id,
    title: formatPokeApiText(d.name),
    subtitle: 'Curva de Experiência (Níveis 1–100)',
    spriteUrl: null,
    badges: [],
    metrics: [
      { label: 'Espécies', value: String(d.speciesCount) },
      { label: 'XP Nv.100', value: String(d.levels.at(-1)?.experience ?? '—') },
    ],
    description: d.description
      ? `${d.description} · Fórmula: ${d.formula}`
      : `Fórmula: ${d.formula}`,
    relatedTitle: null,
    relatedLinks: [],
    reversePokemonTitle: 'Espécies com esta curva de XP',
    reversePokemon: mapPokemonRefs(d.pokemonSpecies),
  }),
  nature: (d) => ({
    id: d.id,
    title: formatPokeApiText(d.name),
    subtitle: d.isNeutral ? 'Natureza Neutra' : 'Natureza Modificadora',
    spriteUrl: null,
    badges: [
      d.increasedStat ? `+10% ${formatPokeApiText(d.increasedStat)}` : 'Sem bônus',
      d.decreasedStat ? `-10% ${formatPokeApiText(d.decreasedStat)}` : 'Sem penalidade',
    ],
    metrics: [
      { label: 'Aprecia', value: d.likesFlavor ? formatPokeApiText(d.likesFlavor) : 'Neutro' },
      { label: 'Rejeita', value: d.hatesFlavor ? formatPokeApiText(d.hatesFlavor) : 'Neutro' },
    ],
    description: d.isNeutral
      ? 'Naturezas neutras não alteram nenhum atributo derivado.'
      : `Eleva ${formatPokeApiText(d.increasedStat)} em 10% e reduz ${formatPokeApiText(d.decreasedStat)} em 10%.`,
    relatedTitle: null,
    relatedLinks: [],
    reversePokemonTitle: null,
    reversePokemon: [],
  }),
  type: (d) => ({
    id: d.id,
    title: formatPokeApiText(d.name),
    subtitle: d.generation
      ? `Tipo Elemental · ${formatPokeApiText(d.generation)}`
      : 'Tipo Elemental',
    spriteUrl: null,
    badges: [
      ...d.damageRelations.doubleDamageTo.map((t) => `2x em ${formatPokeApiText(t)}`),
      ...d.damageRelations.doubleDamageFrom.map((t) => `2x de ${formatPokeApiText(t)}`),
    ],
    metrics: [
      { label: 'Pokémon', value: String(d.pokemonCount) },
      { label: 'Golpes', value: String(d.moveCount) },
    ],
    description:
      d.damageRelations.noDamageFrom.length > 0
        ? `Imune a: ${d.damageRelations.noDamageFrom.map(formatPokeApiText).join(', ')}.`
        : null,
    relatedTitle: d.moves.length > 0 ? 'Golpes deste tipo (amostra)' : null,
    relatedLinks: d.moves.slice(0, 14).map((m) => ({
      category: 'move' as const,
      name: m.name,
      label: formatPokeApiText(m.name),
    })),
    reversePokemonTitle: 'Pokémon deste tipo',
    reversePokemon: mapPokemonRefs(d.pokemon, (idx) => `Slot ${d.pokemon[idx]?.slot ?? 1}`),
  }),
};

export function presentEncyclopediaDetail(
  payload: EncyclopediaDetailPayload,
): PresentedEncyclopediaDetail {
  const presenter = PRESENTERS[payload.kind] as (data: unknown) => PresentedEncyclopediaDetail;
  return presenter(payload.data);
}
