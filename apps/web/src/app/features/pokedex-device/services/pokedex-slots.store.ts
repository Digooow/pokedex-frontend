import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import {
  type PokedexSlotRecord,
  PokedexSlotRecordSchema,
  PokedexSlotsListResponseSchema,
  SavePokedexSlotSchema,
} from '@pokeverse/shared';
import { catchError, forkJoin, map, of } from 'rxjs';
import { AuthStore } from '../../../core/stores/auth.store';
import type { PokemonDetailView, ResolvedPokemonForSlot } from './pokedex.store';

const TOTAL_SLOTS = 10;
const LOCAL_SLOTS_KEY = 'pokedex_slots_salvos';

/** Manages the 10 programmable hardware slots: Neon PostgreSQL when signed in, localStorage for visitors. */
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

  readonly isCloudBacked = computed(() => this.auth.isAuthenticated());
  readonly slotsMap = computed<ReadonlyMap<number, PokedexSlotRecord>>(() =>
    this.isCloudBacked() ? this.cloudSlotsSignal() : this.localSlotsSignal(),
  );
  readonly hasAnySavedSlot = computed(() => this.slotsMap().size > 0);
  readonly busySlot = this.busySlotSignal.asReadonly();
  readonly editMode = this.editModeSignal.asReadonly();
  readonly editingSlotIndex = this.editingSlotIndexSignal.asReadonly();
  readonly feedback = this.feedbackSignal.asReadonly();

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
  ): void {
    if (slotIndex < 0 || slotIndex >= TOTAL_SLOTS || this.busySlotSignal() !== null) {
      return;
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
      return;
    }

    if (!this.isCloudBacked()) {
      this.saveLocalSlot(payload.data);
      return;
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
    const deletes = occupiedIndices.map((idx) =>
      this.http.delete(`/api/v1/pokedex/slots/${idx}`).pipe(
        map(() => ({ idx, ok: true })),
        catchError(() => of({ idx, ok: false })),
      ),
    );

    forkJoin(deletes).subscribe((results) => {
      this.busySlotSignal.set(null);
      const removed = new Set(results.filter((r) => r.ok).map((r) => r.idx));
      this.cloudSlotsSignal.update((prev) => {
        const copy = new Map(prev);
        for (const idx of removed) {
          copy.delete(idx);
        }
        return copy;
      });
      const failedCount = results.length - removed.size;
      this.feedbackSignal.set(
        failedCount === 0
          ? 'Todos os slots na nuvem foram liberados.'
          : `${removed.size} slots liberados; ${failedCount} falharam.`,
      );
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
      for (const [idx, item] of parsed.entries()) {
        if (idx >= TOTAL_SLOTS || typeof item !== 'object' || item === null) {
          continue;
        }
        const recordCandidate = item as Record<string, unknown>;
        const rawName = recordCandidate['name'] ?? recordCandidate['pokemonName'];
        if (typeof rawName !== 'string' || !rawName.trim()) {
          continue;
        }
        const parsedId = Number(recordCandidate['id'] ?? recordCandidate['pokemonId']) || 1;
        const nickname =
          typeof recordCandidate['apelido'] === 'string' && recordCandidate['apelido'].trim()
            ? recordCandidate['apelido'].trim()
            : typeof recordCandidate['nickname'] === 'string' && recordCandidate['nickname'].trim()
              ? recordCandidate['nickname'].trim()
              : null;
        const spriteUrl =
          typeof recordCandidate['spriteUrl'] === 'string' && recordCandidate['spriteUrl']
            ? recordCandidate['spriteUrl']
            : null;
        empty.set(idx, {
          slotIndex: idx,
          pokemonId: parsedId,
          pokemonName: rawName.toLowerCase(),
          nickname,
          spriteUrl,
          updatedAt:
            typeof recordCandidate['updatedAt'] === 'string'
              ? recordCandidate['updatedAt']
              : new Date().toISOString(),
        });
      }
    } catch {
      return new Map();
    }
    return empty;
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
      /* Ignore storage quota errors */
    }
  }
}
