import type { PokemonDetailView } from '../pokedex-device/services/pokedex-view-mapper.util';
import { resolveVisorSpriteUrl } from '../pokedex-device/services/pokedex-visor-format.util';

export interface HolocronPalette {
  readonly primary: number;
  readonly secondary: number;
  readonly accent: number;
}

export interface HolocronTexturePair {
  readonly frontUrl: string | null;
  readonly backUrl: string | null;
}

export const LOCAL_POKEMON_GLB_MODELS: Readonly<Record<number, string>> = {};

const DEFAULT_PALETTE: HolocronPalette = {
  primary: 0x38bdf8,
  secondary: 0x0ea5e9,
  accent: 0xbae6fd,
};

export const TYPE_HOLOGRAM_PALETTE: Readonly<Record<string, HolocronPalette>> = {
  normal: { primary: 0xa8a77a, secondary: 0x6d6d4e, accent: 0xe2e8f0 },
  fire: { primary: 0xf97316, secondary: 0xdc2626, accent: 0xfde047 },
  water: { primary: 0x38bdf8, secondary: 0x2563eb, accent: 0xa5f3fc },
  electric: { primary: 0xfacc15, secondary: 0xeab308, accent: 0xfef08a },
  grass: { primary: 0x4ade80, secondary: 0x16a34a, accent: 0xbbf7d0 },
  ice: { primary: 0x67e8f9, secondary: 0x06b6d4, accent: 0xe0f2fe },
  fighting: { primary: 0xef4444, secondary: 0x991b1b, accent: 0xfca5a5 },
  poison: { primary: 0xc084fc, secondary: 0x7e22ce, accent: 0xe9d5ff },
  ground: { primary: 0xeab308, secondary: 0xa16207, accent: 0xfde68a },
  flying: { primary: 0x93c5fd, secondary: 0x4f46e5, accent: 0xdbeafe },
  psychic: { primary: 0xf472b6, secondary: 0xdb2777, accent: 0xfbcfe8 },
  bug: { primary: 0xa3e635, secondary: 0x65a30d, accent: 0xd9f99d },
  rock: { primary: 0xd6d3d1, secondary: 0x78716c, accent: 0xf5f5f4 },
  ghost: { primary: 0xa78bfa, secondary: 0x5b21b6, accent: 0xddd6fe },
  dragon: { primary: 0x818cf8, secondary: 0x4338ca, accent: 0xc7d2fe },
  dark: { primary: 0x94a3b8, secondary: 0x334155, accent: 0xcbd5e1 },
  steel: { primary: 0x94a3b8, secondary: 0x475569, accent: 0xe2e8f0 },
  fairy: { primary: 0xf9a8d4, secondary: 0xec4899, accent: 0xfce7f3 },
};

export function resolveHolocronPalette(types: readonly string[]): HolocronPalette {
  const firstKey = types[0]?.trim().toLowerCase() ?? '';
  const secondKey = types[1]?.trim().toLowerCase() ?? '';
  const primaryPalette = TYPE_HOLOGRAM_PALETTE[firstKey] ?? DEFAULT_PALETTE;
  const secondaryPalette = TYPE_HOLOGRAM_PALETTE[secondKey];
  if (!secondaryPalette) {
    return primaryPalette;
  }
  return {
    primary: primaryPalette.primary,
    secondary: secondaryPalette.primary,
    accent: primaryPalette.accent,
  };
}

export function computeDeterministicParticleCoord(
  index: number,
  total: number,
): readonly [number, number, number] {
  const safeTotal = Math.max(1, total);
  const ratio = index / safeTotal;
  const angle = index * 2.399963229728653;
  const radius = 0.85 + (index % 7) * 0.14;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  const y = -0.35 + ratio * 1.95;
  return [x, y, z];
}

export function resolveHolocronSpriteUrl(
  pokemon: PokemonDetailView,
  shiny: boolean,
): string | null {
  const resolved = resolveVisorSpriteUrl(pokemon, 'artwork', shiny, false);
  return resolved.primary ?? resolved.fallback;
}

export function resolveHolocronTextures(
  pokemon: PokemonDetailView,
  shiny: boolean,
): HolocronTexturePair {
  const frontUrl = resolveHolocronSpriteUrl(pokemon, shiny);
  const def = pokemon.bundle?.pokemon.sprites.default;
  const backUrl = shiny ? (def?.backShiny ?? def?.backDefault ?? null) : (def?.backDefault ?? null);
  return { frontUrl, backUrl };
}

export function resolveLocalPokemonGlbUrl(pokemonId: number): string | null {
  return LOCAL_POKEMON_GLB_MODELS[pokemonId] ?? null;
}
