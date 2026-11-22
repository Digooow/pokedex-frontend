import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { type PokedexSlotRecord, formatPokeApiText } from '@pokeverse/shared';
import { AuthStore } from '../../../core/stores/auth.store';
import { PvRpgFocusableDirective } from '../directives/rpg-focusable.directive';
import { PokedexRpgNavService } from '../services/pokedex-rpg-nav.service';
import { PokedexSlotsStore } from '../services/pokedex-slots.store';
import { PokedexStore } from '../services/pokedex.store';

const SLOT_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

@Component({
  selector: 'pv-pokedex-slots-config',
  imports: [PvRpgFocusableDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .slot-cloud-sync-hint {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.45rem;
        margin-top: 0.2rem;
        font-size: 0.72rem;
        font-weight: 700;
        color: var(--texto-visor-suave, oklch(36% 0.04 125));
      }

      .slot-feedback-banner {
        margin: 0.25rem 0 0;
        padding: 0.35rem 0.55rem;
        border-radius: 0.375rem;
        border: 1px solid oklch(46% 0.14 152);
        background: oklch(93% 0.05 152);
        color: oklch(26% 0.09 152);
        font-size: 0.74rem;
        font-weight: 700;
      }
    `,
  ],
  template: `
    <div class="slots-config-painel">
      <div class="slots-config-topo">
        <div>
          <h3 class="slots-config-titulo">Configurar Pokémon Salvos</h3>
          <p class="slot-cloud-sync-hint">
            @if (slotsStore.isCloudBacked()) {
              <span>Sincronizado na nuvem (Neon PostgreSQL)</span>
            } @else {
              <span>Modo Visitante (salvo neste navegador)</span>
              <button
                type="button"
                class="btn-slot-acao"
                (click)="onRequestTrainerLogin($event)"
              >
                Sincronizar na nuvem
              </button>
            }
          </p>
        </div>

        <div class="slots-config-acoes-globais">
          @if (slotsStore.hasAnySavedSlot()) {
            <button
              type="button"
              class="btn-slot-acao btn-slot-acao--perigo"
              [disabled]="slotsStore.busySlot() !== null"
              (click)="onClearAll($event)"
            >
              Limpar todos
            </button>
          }
          <button
            type="button"
            class="btn-slot-acao"
            (click)="onCloseConfig($event)"
          >
            Voltar ao visor
          </button>
        </div>
      </div>

      @if (slotsStore.feedback(); as feedback) {
        <p class="slot-feedback-banner" aria-live="polite">{{ feedback }}</p>
      }

      <ul class="slots-config-lista">
        @for (idx of indices; track idx) {
          @let slot = getSlot(idx);
          <li class="slot-config-item">
            <div class="slot-config-linha">
              <div class="slot-config-info">
                <span class="slot-config-num">#{{ padIndex(idx) }}</span>
                @if (slot) {
                  <span class="slot-config-nome">{{ formatSlotLabel(slot) }}</span>
                } @else {
                  <span class="slot-config-nome slot-config-nome--vazio">Slot vazio</span>
                }
              </div>

              <div class="slot-config-botoes">
                @if (slot) {
                  <button
                    type="button"
                    class="btn-slot-acao"
                    (click)="onOpenSlot(slot, $event)"
                  >
                    Abrir
                  </button>
                  <button
                    type="button"
                    class="btn-slot-acao"
                    data-acao-slot="editar"
                    (click)="onToggleEditSlot(slot, idx, $event)"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    class="btn-slot-acao btn-slot-acao--perigo"
                    [disabled]="slotsStore.busySlot() === idx"
                    (click)="onRemoveSlot(idx, $event)"
                  >
                    Remover
                  </button>
                } @else if (pokedex.selectedPokemon(); as active) {
                  @let dupSlot = findSavedSlot(active.id, active.name);
                  @if (dupSlot !== null) {
                    <span class="slot-cloud-sync-hint">Já salvo no #{{ padIndex(dupSlot) }}</span>
                  } @else {
                    <button
                      type="button"
                      class="btn-slot-acao"
                      [disabled]="slotsStore.busySlot() === idx"
                      (click)="onRecordCurrent(idx, $event)"
                    >
                      Gravar {{ active.displayName }}
                    </button>
                  }
                }
              </div>
            </div>

            @if (slot && slotsStore.editingSlotIndex() === idx) {
              <form class="slot-form-editar" (submit)="onSaveEdit($event, idx, slot)">
                <div class="slot-form-campos">
                  <input
                    type="text"
                    class="slot-form-input"
                    [pvRpgFocusable]="'edicao'"
                    [pvRpgOrder]="0"
                    [value]="draftTerm()"
                    placeholder="Nome ou ID na PokéAPI"
                    [attr.aria-label]="'Nome ou ID da PokéAPI para o slot ' + (idx + 1)"
                    (input)="draftTerm.set(readValue($event))"
                  />
                  <input
                    type="text"
                    class="slot-form-input"
                    [pvRpgFocusable]="'edicao'"
                    [pvRpgOrder]="1"
                    maxlength="40"
                    [value]="draftNickname()"
                    placeholder="Apelido opcional"
                    [attr.aria-label]="'Apelido opcional para o slot ' + (idx + 1)"
                    (input)="draftNickname.set(readValue($event))"
                  />
                  <button
                    type="submit"
                    class="btn-slot-acao"
                    [pvRpgFocusable]="'edicao'"
                    [pvRpgOrder]="2"
                    [disabled]="savingEdit()"
                  >
                    {{ savingEdit() ? 'Validando...' : 'Salvar' }}
                  </button>
                  <button
                    type="button"
                    class="btn-slot-acao"
                    [pvRpgFocusable]="'edicao'"
                    [pvRpgOrder]="3"
                    (click)="onCancelEdit($event)"
                  >
                    Cancelar
                  </button>
                </div>
                @if (editError(); as error) {
                  <p class="slot-form-erro">{{ error }}</p>
                }
              </form>
            }
          </li>
        }
      </ul>
    </div>
  `,
})
export class PokedexSlotsConfigComponent {
  readonly slotsStore = inject(PokedexSlotsStore);
  readonly pokedex = inject(PokedexStore);
  private readonly auth = inject(AuthStore);
  private readonly rpg = inject(PokedexRpgNavService);

  readonly closeRequested = output<void>();
  readonly slotOpened = output<string>();

  readonly indices = SLOT_INDICES;
  readonly draftTerm = signal('');
  readonly draftNickname = signal('');
  readonly editError = signal<string | null>(null);
  readonly savingEdit = signal(false);

  getSlot(idx: number): PokedexSlotRecord | null {
    return this.slotsStore.slotsMap().get(idx) ?? null;
  }

  padIndex(idx: number): string {
    return String(idx + 1).padStart(2, '0');
  }

  formatSlotLabel(slot: PokedexSlotRecord): string {
    const display = formatPokeApiText(slot.pokemonName);
    const idSuffix = slot.pokemonId > 0 ? ` (#${String(slot.pokemonId).padStart(4, '0')})` : '';
    return slot.nickname ? `${slot.nickname} — ${display}` : `${display}${idSuffix}`;
  }

  readValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  onRequestTrainerLogin(event: Event): void {
    event.stopPropagation();
    this.auth.requestTrainerAccess(
      'Sincronizar Slots na Nuvem',
      'Entre com sua conta de Treinador para gravar e editar os 10 slots no Neon PostgreSQL.',
    );
  }

  onClearAll(event: Event): void {
    event.stopPropagation();
    const occupiedCount = this.slotsStore.slotsMap().size;
    if (occupiedCount === 0) {
      return;
    }
    this.slotsStore.requestConfirm({
      kind: 'delete-all',
      occupiedCount,
    });
  }

  onCloseConfig(event: Event): void {
    event.stopPropagation();
    this.closeRequested.emit();
  }

  findSavedSlot(pokemonId: number, pokemonName: string): number | null {
    return this.slotsStore.findSlotByPokemon(pokemonId, pokemonName);
  }

  onOpenSlot(slot: PokedexSlotRecord, event: Event): void {
    event.stopPropagation();
    this.slotsStore.setEditMode(false);
    this.pokedex.setQuery(slot.pokemonName);
    this.pokedex.loadPokemonDetail(slot.pokemonName);
    this.slotOpened.emit(slot.pokemonName);
  }

  onToggleEditSlot(slot: PokedexSlotRecord, idx: number, event: Event): void {
    event.stopPropagation();
    const opening = this.slotsStore.editingSlotIndex() !== idx;
    this.editError.set(null);
    if (opening) {
      this.draftTerm.set(slot.pokemonName);
      this.draftNickname.set(slot.nickname ?? '');
      this.slotsStore.setEditingSlotIndex(idx);
      this.rpg.rpgLevel.set('edicao');
      this.rpg.rpgScreen.set('visor');
      this.rpg.rpgControlIndices.update((prev) => ({ ...prev, edicao: 0 }));
      if (this.rpg.keyboardRpgActive()) {
        setTimeout(() => this.rpg.syncFocusVisuals(true), 0);
      }
    } else {
      this.slotsStore.setEditingSlotIndex(null);
      this.rpg.rpgLevel.set('itens');
    }
  }

  onCancelEdit(event: Event): void {
    event.stopPropagation();
    this.editError.set(null);
    this.slotsStore.setEditingSlotIndex(null);
    this.rpg.rpgLevel.set('itens');
    if (this.rpg.keyboardRpgActive()) {
      setTimeout(() => this.rpg.syncFocusVisuals(true), 0);
    }
  }

  onRemoveSlot(idx: number, event: Event): void {
    event.stopPropagation();
    const slot = this.getSlot(idx);
    if (!slot) {
      return;
    }
    this.slotsStore.requestConfirm({
      kind: 'delete-one',
      slotIndex: idx,
      existingLabel: `#${this.padIndex(idx)} ${this.formatSlotLabel(slot)}`,
    });
  }

  onRecordCurrent(idx: number, event: Event): void {
    event.stopPropagation();
    const active = this.pokedex.selectedPokemon();
    if (!active) {
      return;
    }
    this.slotsStore.saveSlot(idx, active);
  }

  async onSaveEdit(event: Event, idx: number, slotAtual: PokedexSlotRecord): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const term = this.draftTerm().trim().toLowerCase().replaceAll(/\s+/g, '-');
    const nickname = this.draftNickname().trim().slice(0, 40) || null;

    if (!term) {
      this.editError.set('Informe um nome ou ID válido da PokéAPI.');
      return;
    }

    if (term === slotAtual.pokemonName.toLowerCase()) {
      this.editError.set(null);
      this.slotsStore.saveSlot(
        idx,
        {
          id: slotAtual.pokemonId,
          name: slotAtual.pokemonName,
          displayName: formatPokeApiText(slotAtual.pokemonName),
          spriteUrl: slotAtual.spriteUrl,
        },
        nickname,
      );
      this.rpg.rpgLevel.set('itens');
      return;
    }

    this.savingEdit.set(true);
    this.editError.set(null);
    try {
      const resolved = await this.pokedex.resolvePokemonForSlot(term);
      if (!resolved) {
        this.editError.set('Pokémon não encontrado na PokéAPI. Verifique o nome ou ID.');
        return;
      }
      const dupSlot = this.slotsStore.findSlotByPokemon(resolved.id, resolved.name, idx);
      if (dupSlot !== null) {
        this.editError.set(
          `${resolved.displayName} já está cadastrado no Botão #${this.padIndex(dupSlot)}. Apenas 1 Pokémon por botão.`,
        );
        return;
      }
      this.slotsStore.requestConfirm({
        kind: 'overwrite-edit',
        slotIndex: idx,
        existingLabel: this.formatSlotLabel(slotAtual),
        nextPokemon: resolved,
        nickname,
      });
      this.rpg.rpgLevel.set('itens');
    } finally {
      this.savingEdit.set(false);
    }
  }
}
