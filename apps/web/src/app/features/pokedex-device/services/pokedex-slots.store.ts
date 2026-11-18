import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import {
  type PokedexSlotRecord,
  PokedexSlotRecordSchema,
  PokedexSlotsListResponseSchema,
  type SavePokedexSlotInput,
} from '@pokeverse/shared';
import { catchError, map, of } from 'rxjs';
import { AuthStore } from '../../../core/stores/auth.store';
import type { PokemonDetailView } from './pokedex.store';

@Injectable({ providedIn: 'root' })
export class PokedexSlotsStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthStore);

  private readonly slotsMapSignal = signal<ReadonlyMap<number, PokedexSlotRecord>>(new Map());
  private readonly busySlotSignal = signal<number | null>(null);
  private readonly editModeSignal = signal(false);
  private readonly feedbackSignal = signal<string | null>(null);

  readonly slotsMap = this.slotsMapSignal.asReadonly();
  readonly busySlot = this.busySlotSignal.asReadonly();
  readonly editMode = this.editModeSignal.asReadonly();
  readonly feedback = this.feedbackSignal.asReadonly();

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.loadSlots();
      } else {
        this.slotsMapSignal.set(new Map());
        this.editModeSignal.set(false);
        this.feedbackSignal.set(null);
      }
    });
  }

  toggleEditMode(): void {
    if (!this.auth.isAuthenticated()) {
      return;
    }
    const next = !this.editModeSignal();
    this.editModeSignal.set(next);
    this.feedbackSignal.set(
      next
        ? 'Modo edição ativo: clique em um slot ocupado para remover ou sobrescrever.'
        : null,
    );
  }

  loadSlots(): void {
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
        for (const slot of parsed.data.slots) {
          next.set(slot.slotIndex, slot);
        }
        this.slotsMapSignal.set(next);
      });
  }

  saveSlot(slotIndex: number, pokemon: PokemonDetailView): void {
    if (this.busySlotSignal() !== null || !this.auth.isAuthenticated()) {
      return;
    }

    const payload: SavePokedexSlotInput = {
      slotIndex,
      pokemonId: pokemon.id,
      pokemonName: pokemon.displayName,
      spriteUrl: pokemon.spriteUrl ?? null,
    };

    this.busySlotSignal.set(slotIndex);
    this.http
      .put<unknown>(`/api/v1/pokedex/slots/${slotIndex}`, payload)
      .pipe(
        map((raw) => PokedexSlotRecordSchema.safeParse(raw)),
        catchError((err: unknown) => of({ httpError: err } as const)),
      )
      .subscribe((outcome) => {
        this.busySlotSignal.set(null);
        if ('httpError' in outcome || !outcome.success) {
          this.feedbackSignal.set(
            'httpError' in outcome && outcome.httpError instanceof HttpErrorResponse
              ? `Erro HTTP ${outcome.httpError.status} ao salvar o Slot ${slotIndex + 1}.`
              : `Falha ao validar resposta ao salvar o Slot ${slotIndex + 1}.`,
          );
          return;
        }

        this.slotsMapSignal.update((prev) => {
          const copy = new Map(prev);
          copy.set(slotIndex, outcome.data);
          return copy;
        });
        this.feedbackSignal.set(
          `Slot ${slotIndex + 1} salvo no PostgreSQL: ${outcome.data.pokemonName} (${pokemon.paddedId}).`,
        );
      });
  }

  clearSlot(slotIndex: number): void {
    if (this.busySlotSignal() !== null || !this.auth.isAuthenticated()) {
      return;
    }

    this.busySlotSignal.set(slotIndex);
    this.http
      .delete<void>(`/api/v1/pokedex/slots/${slotIndex}`)
      .pipe(catchError(() => of('error' as const)))
      .subscribe((result) => {
        this.busySlotSignal.set(null);
        if (result === 'error') {
          this.feedbackSignal.set(`Não foi possível limpar o Slot ${slotIndex + 1}.`);
          return;
        }
        this.slotsMapSignal.update((prev) => {
          const copy = new Map(prev);
          copy.delete(slotIndex);
          return copy;
        });
        this.feedbackSignal.set(`Slot ${slotIndex + 1} liberado na nuvem.`);
      });
  }

  notifyHint(message: string): void {
    this.feedbackSignal.set(message);
  }
}
