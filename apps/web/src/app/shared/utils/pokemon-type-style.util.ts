import { POKEMON_TYPES, type PokemonTypeName } from '@pokeverse/shared';

const POKEMON_TYPE_SET: ReadonlySet<string> = new Set(POKEMON_TYPES);
const DAMAGE_RELATION_TYPE_PATTERN = /^(?:2x|4x|0\.5x|0\.25x|0x)\s+(?:em|de)\s+([a-z]+)$/i;

export function resolvePokemonTypeSlug(raw: string | null | undefined): PokemonTypeName | null {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return POKEMON_TYPE_SET.has(normalized) ? (normalized as PokemonTypeName) : null;
}

export function extractPokemonTypeFromBadge(badge: string): PokemonTypeName | null {
  const direct = resolvePokemonTypeSlug(badge);
  if (direct) {
    return direct;
  }
  const match = DAMAGE_RELATION_TYPE_PATTERN.exec(badge.trim());
  return match ? resolvePokemonTypeSlug(match[1]) : null;
}
