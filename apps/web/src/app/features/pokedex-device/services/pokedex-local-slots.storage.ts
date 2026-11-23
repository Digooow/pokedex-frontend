import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { type PokedexSlotRecord, TOTAL_POKEDEX_SLOTS, isHttpsUrl } from '@pokeverse/shared';
import { PrivacyConsentStore } from '../../../core/stores/privacy-consent.store';

const LOCAL_SLOTS_KEY = 'pokedex_slots_salvos';

export interface LocalSlotSaveInput {
  readonly slotIndex: number;
  readonly pokemonId: number;
  readonly pokemonName: string;
  readonly nickname?: string | null;
  readonly spriteUrl?: string | null;
}

export function buildLocalSlotRecord(payload: LocalSlotSaveInput): PokedexSlotRecord {
  return {
    slotIndex: payload.slotIndex,
    pokemonId: payload.pokemonId,
    pokemonName: payload.pokemonName.toLowerCase(),
    nickname: payload.nickname ?? null,
    spriteUrl: payload.spriteUrl ?? null,
    updatedAt: new Date().toISOString(),
  };
}

@Injectable({ providedIn: 'root' })
export class PokedexLocalSlotsStorage {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly privacy = inject(PrivacyConsentStore);

  load(): Map<number, PokedexSlotRecord> {
    const slots = new Map<number, PokedexSlotRecord>();
    if (!this.isBrowser || !this.privacy.canPersistFunctionalPreferences()) {
      return slots;
    }
    try {
      const raw = window.localStorage.getItem(LOCAL_SLOTS_KEY);
      if (!raw) {
        return slots;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return slots;
      }
      const seenIds = new Set<number>();
      const seenNames = new Set<string>();
      for (const [idx, item] of parsed.entries()) {
        if (idx >= TOTAL_POKEDEX_SLOTS) {
          continue;
        }
        const entry = this.parseLocalSlotEntry(idx, item);
        if (!entry || seenIds.has(entry.pokemonId) || seenNames.has(entry.pokemonName)) {
          continue;
        }
        seenIds.add(entry.pokemonId);
        seenNames.add(entry.pokemonName);
        slots.set(idx, entry);
      }
      return slots;
    } catch {
      return new Map();
    }
  }

  persist(slots: ReadonlyMap<number, PokedexSlotRecord>): void {
    if (!this.isBrowser || !this.privacy.canPersistFunctionalPreferences()) {
      return;
    }
    try {
      const serialized = Array.from({ length: TOTAL_POKEDEX_SLOTS }, (_, idx) => {
        const entry = slots.get(idx);
        if (!entry) {
          return null;
        }
        return {
          name: entry.pokemonName,
          id: entry.pokemonId,
          apelido: entry.nickname ?? '',
          spriteUrl: entry.spriteUrl,
          updatedAt: entry.updatedAt,
        };
      });
      window.localStorage.setItem(LOCAL_SLOTS_KEY, JSON.stringify(serialized));
    } catch {
      return;
    }
  }

  private parseLocalSlotEntry(idx: number, item: unknown): PokedexSlotRecord | null {
    if (typeof item !== 'object' || item === null) {
      return null;
    }
    const candidate = item as Record<string, unknown>;
    const rawName = candidate['name'] ?? candidate['pokemonName'];
    if (typeof rawName !== 'string' || !rawName.trim()) {
      return null;
    }

    const parsedId = Number(candidate['id'] ?? candidate['pokemonId']) || 1;
    const nickname =
      this.extractTrimmedString(candidate['apelido']) ??
      this.extractTrimmedString(candidate['nickname']);
    const rawSpriteUrl = this.extractTrimmedString(candidate['spriteUrl']);
    const spriteUrl = rawSpriteUrl && isHttpsUrl(rawSpriteUrl) ? rawSpriteUrl : null;
    const updatedAt =
      typeof candidate['updatedAt'] === 'string'
        ? candidate['updatedAt']
        : new Date().toISOString();

    return {
      slotIndex: idx,
      pokemonId: parsedId,
      pokemonName: rawName.toLowerCase(),
      nickname,
      spriteUrl,
      updatedAt,
    };
  }

  private extractTrimmedString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
  }
}
