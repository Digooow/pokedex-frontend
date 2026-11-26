import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  type ParsedShowdownSpread,
  formatShowdownSpread,
  parseShowdownSpread,
} from '@pokeverse/shared';
import type { StatSpreadValues } from '../../services/pokedex-stat-calc.util';

const SAMPLE_VGC_SPREAD = [
  'Level: 50',
  'EVs: 4 HP / 252 SpA / 252 Spe',
  'Timid Nature',
  'IVs: 0 Atk',
].join('\n');

@Component({
  selector: 'pv-pokedex-spread-io-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pokedex-spread-io-panel.component.html',
  styleUrl: './pokedex-spread-io-panel.component.scss',
})
export class PokedexSpreadIoPanelComponent {
  readonly pokemonName = input.required<string>();
  readonly level = input.required<number>();
  readonly natureKey = input.required<string>();
  readonly ivs = input.required<StatSpreadValues>();
  readonly evs = input.required<StatSpreadValues>();

  readonly spreadImported = output<ParsedShowdownSpread>();

  readonly importText = signal('');
  readonly statusMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly warnings = signal<readonly string[]>([]);

  readonly exportedText = computed(() =>
    formatShowdownSpread({
      pokemonName: this.pokemonName(),
      level: this.level(),
      natureKey: this.natureKey(),
      ivs: this.ivs(),
      evs: this.evs(),
    }),
  );

  onImportInput(event: Event): void {
    this.importText.set((event.target as HTMLTextAreaElement).value);
    this.errorMessage.set(null);
  }

  async copyExport(): Promise<void> {
    this.errorMessage.set(null);
    const text = this.exportedText();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        this.statusMessage.set('Spread Showdown copiado para a área de transferência.');
        return;
      }
      this.statusMessage.set('Texto pronto para cópia manual no quadro acima.');
    } catch {
      this.statusMessage.set('Selecione e copie o texto diretamente no quadro acima.');
    }
  }

  loadExample(): void {
    this.importText.set(`${this.pokemonName()}\n${SAMPLE_VGC_SPREAD}`);
    this.errorMessage.set(null);
    this.statusMessage.set(null);
  }

  applyImport(): void {
    const outcome = parseShowdownSpread(this.importText());
    if (!outcome.ok) {
      this.errorMessage.set(outcome.error);
      this.statusMessage.set(null);
      this.warnings.set([]);
      return;
    }
    this.errorMessage.set(null);
    this.warnings.set(outcome.warnings);
    this.statusMessage.set('Spread importado e aplicado à calculadora.');
    this.spreadImported.emit(outcome.data);
  }
}
