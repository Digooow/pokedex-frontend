import { HttpClient } from '@angular/common/http';
import { Injectable, type WritableSignal, computed, effect, inject, signal } from '@angular/core';
import {
  type PokedexSlotRecord,
  PokedexSlotRecordSchema,
  PokedexSlotsListResponseSchema,
  SavePokedexSlotSchema,
  SwapPokedexSlotsSchema,
  TOTAL_POKEDEX_SLOTS,
} from '@pokeverse/shared';
import { catchError, map, of } from 'rxjs';
import { AuthStore } from '../../../core/stores/auth.store';
import {
  PokedexLocalSlotsStorage,
  buildLocalSlotRecord,
  buildSwappedSlotMap,
  formatSlotNumber,
} from './pokedex-local-slots.storage';
import type { PokemonDetailView, ResolvedPokemonForSlot } from './pokedex.store';

export type SlotConfirmPrompt =
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

@Injectable({ providedIn: 'root' })
export class PokedexSlotsStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthStore);
  private readonly localSlots = inject(PokedexLocalSlotsStorage);

  private readonly cloudSlotsSignal = signal<ReadonlyMap<number, PokedexSlotRecord>>(new Map());
  private readonly localSlotsSignal = signal<ReadonlyMap<number, PokedexSlotRecord>>(
    this.localSlots.load(),
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
        return;
      }
      this.cloudSlotsSignal.set(new Map());
      this.editingSlotIndexSignal.set(null);
      this.feedbackSignal.set(null);
    });
  }

  toggleEditMode(): void {
    this.editModeSignal.set(!this.editModeSignal());
    this.editingSlotIndexSignal.set(null);
    this.feedbackSignal.set(null);
  }

  setEditMode(open: boolean): void {
    this.editModeSignal.set(open);
    if (!open) {
      this.editingSlotIndexSignal.set(null);
    }
  }

  setEditingSlotIndex = (index: number | null) => this.editingSlotIndexSignal.set(index);
  requestConfirm = (prompt: SlotConfirmPrompt) => this.pendingConfirmSignal.set(prompt);
  closeConfirm = () => this.pendingConfirmSignal.set(null);

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
      this.localSlotsSignal.set(this.localSlots.load());
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
        this.applyCloudSlotsList(parsed.data.slots);
      });
  }

  saveSlot(
    slotIndex: number,
    pokemon: PokemonDetailView | ResolvedPokemonForSlot,
    nickname: string | null = null,
  ): boolean {
    if (slotIndex < 0 || slotIndex >= TOTAL_POKEDEX_SLOTS || this.busySlotSignal() !== null) {
      return false;
    }

    const duplicateSlot = this.findSlotByPokemon(pokemon.id, pokemon.name, slotIndex);
    if (duplicateSlot !== null) {
      this.feedbackSignal.set(
        `${pokemon.displayName} já está salvo no Slot ${formatSlotNumber(duplicateSlot)}. Cada Pokémon pode ocupar apenas um botão.`,
      );
      return false;
    }

    const payload = SavePokedexSlotSchema.safeParse({
      slotIndex,
      pokemonId: pokemon.id,
      pokemonName: pokemon.name,
      nickname: nickname?.trim() || null,
      spriteUrl: pokemon.spriteUrl,
    });

    if (!payload.success) {
      this.feedbackSignal.set('Dados do Pokémon inválidos para gravação.');
      return false;
    }

    if (!this.isCloudBacked()) {
      const record = buildLocalSlotRecord(payload.data);
      this.mutateSlotMap(this.localSlotsSignal, (copy) => copy.set(slotIndex, record), true);
      this.editingSlotIndexSignal.set(null);
      this.feedbackSignal.set(`Salvo no slot ${formatSlotNumber(slotIndex)}`);
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
            `Falha ao gravar no Slot ${formatSlotNumber(slotIndex)} na nuvem.`,
          );
          return;
        }
        this.mutateSlotMap(
          this.cloudSlotsSignal,
          (copy) => copy.set(slotIndex, parsed.data),
          false,
        );
        this.editingSlotIndexSignal.set(null);
        this.feedbackSignal.set(
          `Salvo no slot ${formatSlotNumber(slotIndex)} (${pokemon.displayName})`,
        );
      });
    return true;
  }

  swapSlots(fromIndex: number, toIndex: number): boolean {
    if (this.busySlotSignal() !== null) {
      return false;
    }
    const parsed = SwapPokedexSlotsSchema.safeParse({ fromIndex, toIndex });
    if (!parsed.success || !this.slotsMap().has(fromIndex)) {
      return false;
    }

    this.editingSlotIndexSignal.set(null);
    const label = `Slots #${formatSlotNumber(fromIndex)} e #${formatSlotNumber(toIndex)} reorganizados.`;

    if (!this.isCloudBacked()) {
      const next = buildSwappedSlotMap(this.localSlotsSignal(), fromIndex, toIndex);
      this.localSlotsSignal.set(next);
      this.localSlots.persist(next);
      this.feedbackSignal.set(label);
      return true;
    }

    this.busySlotSignal.set(-1);
    this.feedbackSignal.set(null);

    this.http
      .patch<unknown>('/api/v1/pokedex/slots/swap', parsed.data)
      .pipe(
        map((raw) => PokedexSlotsListResponseSchema.safeParse(raw)),
        catchError(() => of(null)),
      )
      .subscribe((res) => {
        this.busySlotSignal.set(null);
        if (!res?.success) {
          this.feedbackSignal.set('Não foi possível reordenar os slots na nuvem.');
          return;
        }
        this.applyCloudSlotsList(res.data.slots);
        this.feedbackSignal.set(label);
      });
    return true;
  }

  clearSlot(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= TOTAL_POKEDEX_SLOTS || this.busySlotSignal() !== null) {
      return;
    }

    if (this.editingSlotIndexSignal() === slotIndex) {
      this.editingSlotIndexSignal.set(null);
    }

    if (!this.isCloudBacked()) {
      this.mutateSlotMap(this.localSlotsSignal, (copy) => copy.delete(slotIndex), true);
      this.feedbackSignal.set(`Slot ${formatSlotNumber(slotIndex)} liberado.`);
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
          this.feedbackSignal.set(`Não foi possível limpar o Slot ${formatSlotNumber(slotIndex)}.`);
          return;
        }
        this.mutateSlotMap(this.cloudSlotsSignal, (copy) => copy.delete(slotIndex), false);
        this.feedbackSignal.set(`Slot ${formatSlotNumber(slotIndex)} liberado na nuvem.`);
      });
  }

  clearAllSlots(): void {
    this.editingSlotIndexSignal.set(null);

    if (!this.isCloudBacked()) {
      const empty = new Map<number, PokedexSlotRecord>();
      this.localSlotsSignal.set(empty);
      this.localSlots.persist(empty);
      this.feedbackSignal.set('Todos os slots locais foram limpos.');
      return;
    }

    if (this.cloudSlotsSignal().size === 0) {
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

  private applyCloudSlotsList(slots: readonly PokedexSlotRecord[]): void {
    const next = new Map<number, PokedexSlotRecord>();
    for (const item of slots) {
      next.set(item.slotIndex, item);
    }
    this.cloudSlotsSignal.set(next);
  }

  private mutateSlotMap(
    target: WritableSignal<ReadonlyMap<number, PokedexSlotRecord>>,
    mutator: (copy: Map<number, PokedexSlotRecord>) => void,
    persistLocally: boolean,
  ): void {
    target.update((prev) => {
      const copy = new Map(prev);
      mutator(copy);
      if (persistLocally) {
        this.localSlots.persist(copy);
      }
      return copy;
    });
  }
}
