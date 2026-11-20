import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import {
  type PokedexSlotRecord,
  PokedexSlotRecordSchema,
  PokedexSlotsListResponseSchema,
  SavePokedexSlotSchema,
} from '@pokeverse/shared';
import { catchError, map, of } from 'rxjs';
import { AuthStore } from '../../../core/stores/auth.store';
import type { PokemonDetailView, ResolvedPokemonForSlot } from './pokedex.store';

export type SlotConfirmPrompt =
  | {
      readonly kind: 'overwrite-click';
      readonly slotIndex: number;
      readonly existingLabel: string;
      readonly existingName: string;
      readonly candidate: PokemonDetailView;
      readonly duplicateSlotIndex: number | null;
    }
  | {
      readonly kind: 'overwrite-edit';
      readonly slotIndex: number;
      readonly existingLabel: string;
      readonly nextPokemon: ResolvedPokemonForSlot;
      readonly nickname: string | null;
    }
  | {
      readonly kind: 'delete-one';
      readonly slotIndex: number;
      readonly existingLabel: string;
    }
  | {
      readonly kind: 'delete-all';
      readonly occupiedCount: number;
    };

const TOTAL_SLOTS = 10;
const LOCAL_SLOTS_KEY = 'pokedex_slots_salvos';

@Injectable({ providedIn: 'root' })
export class PokedexSlotsStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly cloudSlotsSignal = signal<ReadonlyMap<number, PokedexSlotRecord>>(new Map());
  private readonly localSlotsSignal = signal<ReadonlyMap<number, PokedexSlotRecord>>(
    this.loadLocalSlots(),
  );
  private readonly busySlotSignal = signal<number | null>(null);
  private readonly editModeSignal = signal(false);
  private readonly editingSlotIndexSignal = signal<number | null>(null);
  private readonly feedbackSignal = signal<string | null>(null);
  private readonly pendingConfirmSignal = signal<SlotConfirmPrompt | null>(null);

  readonly isCloudBacked = computed(() => this.auth.isAuthenticated());
  readonly slotsMap = computed<ReadonlyMap<number, PokedexSlotRecord>>(() =>
    this.isCloudBacked() ? this.cloudSlotsSignal() : this.localSlotsSignal(),
  );
  readonly hasAnySavedSlot = computed(() => this.slotsMap().size > 0);
  readonly busySlot = this.busySlotSignal.asReadonly();
  readonly editMode = this.editModeSignal.asReadonly();
  readonly editingSlotIndex = this.editingSlotIndexSignal.asReadonly();
  readonly feedback = this.feedbackSignal.asReadonly();
  readonly pendingConfirm = this.pendingConfirmSignal.asReadonly();

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.editingSlotIndexSignal.set(null);
        this.loadSlots();
      } else {
        this.cloudSlotsSignal.set(new Map());
        this.editingSlotIndexSignal.set(null);
        this.feedbackSignal.set(null);
      }
    });
  }

  toggleEditMode(): void {
    const next = !this.editModeSignal();
    this.editModeSignal.set(next);
    this.editingSlotIndexSignal.set(null);
    this.feedbackSignal.set(null);
  }

  setEditMode(open: boolean): void {
    this.editModeSignal.set(open);
    if (!open) {
      this.editingSlotIndexSignal.set(null);
    }
  }

  setEditingSlotIndex(index: number | null): void {
    this.editingSlotIndexSignal.set(index);
  }

  requestConfirm(prompt: SlotConfirmPrompt): void {
    this.pendingConfirmSignal.set(prompt);
  }

  closeConfirm(): void {
    this.pendingConfirmSignal.set(null);
  }

  findSlotByPokemon(
    pokemonId: number,
    pokemonName: string,
    excludeSlotIndex?: number,
  ): number | null {
    const normalizedName = pokemonName.trim().toLowerCase();
    for (const [idx, entry] of this.slotsMap().entries()) {
      if (excludeSlotIndex !== undefined && idx === excludeSlotIndex) {
        continue;
      }
      if (entry.pokemonId === pokemonId || entry.pokemonName.toLowerCase() === normalizedName) {
        return idx;
      }
    }
    return null;
  }

  loadSlots(): void {
    if (!this.auth.isAuthenticated()) {
      this.localSlotsSignal.set(this.loadLocalSlots());
      return;
    }

    this.http
      .get<unknown>('/api/v1/pokedex/slots')
      .pipe(
        map((raw) => PokedexSlotsListResponseSchema.safeParse(raw)),
        catchError(() => of(null)),
      )
      .subscribe((parsed) => {
        if (!parsed?.success) {
          return;
        }
        const next = new Map<number, PokedexSlotRecord>();
        for (const item of parsed.data.slots) {
          next.set(item.slotIndex, item);
        }
        this.cloudSlotsSignal.set(next);
      });
  }

  saveSlot(
    slotIndex: number,
    pokemon: PokemonDetailView | ResolvedPokemonForSlot,
    nickname: string | null = null,
  ): boolean {
    if (slotIndex < 0 || slotIndex >= TOTAL_SLOTS || this.busySlotSignal() !== null) {
      return false;
    }

    const duplicateSlot = this.findSlotByPokemon(pokemon.id, pokemon.name, slotIndex);
    if (duplicateSlot !== null) {
      this.feedbackSignal.set(
        `${pokemon.displayName} já está salvo no Slot ${String(duplicateSlot + 1).padStart(2, '0')}. Cada Pokémon pode ocupar apenas um botão.`,
      );
      return false;
    }

    const cleanNickname = nickname?.trim() ? nickname.trim() : null;
    const payload = SavePokedexSlotSchema.safeParse({
      slotIndex,
      pokemonId: pokemon.id,
      pokemonName: pokemon.name,
      nickname: cleanNickname,
      spriteUrl: pokemon.spriteUrl,
    });

    if (!payload.success) {
      this.feedbackSignal.set('Dados do Pokémon inválidos para gravação.');
      return false;
    }

    if (!this.isCloudBacked()) {
      this.saveLocalSlot(payload.data);
      return true;
    }

    this.busySlotSignal.set(slotIndex);
    this.feedbackSignal.set(null);

    this.http
      .put<unknown>(`/api/v1/pokedex/slots/${slotIndex}`, payload.data)
      .pipe(
        map((raw) => PokedexSlotRecordSchema.safeParse(raw)),
        catchError(() => of(null)),
      )
      .subscribe((parsed) => {
        this.busySlotSignal.set(null);
        if (!parsed?.success) {
          this.feedbackSignal.set(
            `Falha ao gravar no Slot ${String(slotIndex + 1).padStart(2, '0')} na nuvem.`,
          );
          return;
        }
        this.cloudSlotsSignal.update((prev) => {
          const copy = new Map(prev);
          copy.set(slotIndex, parsed.data);
          return copy;
        });
        this.editingSlotIndexSignal.set(null);
        this.feedbackSignal.set(
          `Salvo no slot ${String(slotIndex + 1).padStart(2, '0')} (${pokemon.displayName})`,
        );
      });
    return true;
  }

  clearSlot(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= TOTAL_SLOTS || this.busySlotSignal() !== null) {
      return;
    }

    if (this.editingSlotIndexSignal() === slotIndex) {
      this.editingSlotIndexSignal.set(null);
    }

    if (!this.isCloudBacked()) {
      this.localSlotsSignal.update((prev) => {
        const copy = new Map(prev);
        copy.delete(slotIndex);
        this.persistLocalSlots(copy);
        return copy;
      });
      this.feedbackSignal.set(`Slot ${String(slotIndex + 1).padStart(2, '0')} liberado.`);
      return;
    }

    this.busySlotSignal.set(slotIndex);
    this.http
      .delete(`/api/v1/pokedex/slots/${slotIndex}`)
      .pipe(
        map(() => true),
        catchError(() => of(false)),
      )
      .subscribe((ok) => {
        this.busySlotSignal.set(null);
        if (!ok) {
          this.feedbackSignal.set(
            `Não foi possível limpar o Slot ${String(slotIndex + 1).padStart(2, '0')}.`,
          );
          return;
        }
        this.cloudSlotsSignal.update((prev) => {
          const copy = new Map(prev);
          copy.delete(slotIndex);
          return copy;
        });
        this.feedbackSignal.set(
          `Slot ${String(slotIndex + 1).padStart(2, '0')} liberado na nuvem.`,
        );
      });
  }

  clearAllSlots(): void {
    this.editingSlotIndexSignal.set(null);

    if (!this.isCloudBacked()) {
      const empty = new Map<number, PokedexSlotRecord>();
      this.localSlotsSignal.set(empty);
      this.persistLocalSlots(empty);
      this.feedbackSignal.set('Todos os slots locais foram limpos.');
      return;
    }

    const occupiedIndices = [...this.cloudSlotsSignal().keys()];
    if (occupiedIndices.length === 0) {
      return;
    }

    this.busySlotSignal.set(-1);
    this.http
      .delete('/api/v1/pokedex/slots')
      .pipe(
        map(() => true),
        catchError(() => of(false)),
      )
      .subscribe((ok) => {
        this.busySlotSignal.set(null);
        if (!ok) {
          this.feedbackSignal.set('Não foi possível liberar todos os slots na nuvem.');
          return;
        }
        this.cloudSlotsSignal.set(new Map<number, PokedexSlotRecord>());
        this.feedbackSignal.set('Todos os slots na nuvem foram liberados.');
      });
  }

  private saveLocalSlot(payload: {
    slotIndex: number;
    pokemonId: number;
    pokemonName: string;
    nickname?: string | null;
    spriteUrl?: string | null;
  }): void {
    const record: PokedexSlotRecord = {
      slotIndex: payload.slotIndex,
      pokemonId: payload.pokemonId,
      pokemonName: payload.pokemonName.toLowerCase(),
      nickname: payload.nickname ?? null,
      spriteUrl: payload.spriteUrl ?? null,
      updatedAt: new Date().toISOString(),
    };
    this.localSlotsSignal.update((prev) => {
      const copy = new Map(prev);
      copy.set(payload.slotIndex, record);
      this.persistLocalSlots(copy);
      return copy;
    });
    this.editingSlotIndexSignal.set(null);
    this.feedbackSignal.set(`Salvo no slot ${String(payload.slotIndex + 1).padStart(2, '0')}`);
  }

  private loadLocalSlots(): Map<number, PokedexSlotRecord> {
    const empty = new Map<number, PokedexSlotRecord>();
    if (!this.isBrowser) {
      return empty;
    }
    try {
      const raw = window.localStorage.getItem(LOCAL_SLOTS_KEY);
      if (!raw) {
        return empty;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return empty;
      }
      const seenIds = new Set<number>();
      const seenNames = new Set<string>();
      for (const [idx, item] of parsed.entries()) {
        if (idx >= TOTAL_SLOTS) {
          continue;
        }
        const entry = this.parseLocalSlotEntry(idx, item);
        if (!entry) {
          continue;
        }
        if (seenIds.has(entry.pokemonId) || seenNames.has(entry.pokemonName)) {
          continue;
        }
        seenIds.add(entry.pokemonId);
        seenNames.add(entry.pokemonName);
        empty.set(idx, entry);
      }
      return empty;
    } catch {
      return new Map();
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
    const nickname = this.extractTrimmedString(candidate['apelido'])
      ?? this.extractTrimmedString(candidate['nickname']);
    const spriteUrl = this.extractTrimmedString(candidate['spriteUrl']);
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

  private persistLocalSlots(slots: ReadonlyMap<number, PokedexSlotRecord>): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      const serialized = Array.from({ length: TOTAL_SLOTS }, (_, idx) => {
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
}
