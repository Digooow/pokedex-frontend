import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { POKEMON_TYPES, type PokemonTypeName, formatPokeApiText } from '@pokeverse/shared';
import {
  type CatalogSortOption,
  type FilterFlagKey,
  PokedexFiltersStore,
} from '../services/pokedex-filters.store';

@Component({
  selector: 'pv-pokedex-filters-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: block; flex-shrink: 0; }'],
  templateUrl: './pokedex-filters-panel.component.html',
})
export class PokedexFiltersPanelComponent {
  readonly filters = inject(PokedexFiltersStore);

  readonly availableTypes = computed<readonly PokemonTypeName[]>(() => {
    const meta = this.filters.metaState();
    if (meta.status !== 'success') return POKEMON_TYPES;
    const allowed = new Set<string>(POKEMON_TYPES);
    const filtered = meta.data.types
      .map((item) => item.name.toLowerCase())
      .filter((name): name is PokemonTypeName => allowed.has(name));
    return filtered.length > 0 ? filtered : POKEMON_TYPES;
  });

  readonly generationOptions = computed(() => {
    const meta = this.filters.metaState();
    if (meta.status === 'success' && meta.data.generations.length > 0) {
      return meta.data.generations;
    }
    return Array.from({ length: 9 }, (_, idx) => ({
      id: idx + 1,
      name: `generation-${idx + 1}`,
      regionName: null,
    }));
  });

  readonly habitatOptions = computed(() => {
    const meta = this.filters.metaState();
    return meta.status === 'success' ? meta.data.habitats : [];
  });

  readonly colorOptions = computed(() => {
    const meta = this.filters.metaState();
    return meta.status === 'success' ? meta.data.colors : [];
  });

  readonly shapeOptions = computed(() => {
    const meta = this.filters.metaState();
    return meta.status === 'success' ? meta.data.shapes : [];
  });

  readonly flagToggles: readonly { readonly key: FilterFlagKey; readonly label: string }[] = [
    { key: 'onlyLegendary', label: 'Lendário' },
    { key: 'onlyMythical', label: 'Mítico' },
    { key: 'onlyBaby', label: 'Bebê' },
    { key: 'excludeAlternateForms', label: 'Sem formas alt.' },
  ];

  readonly formatLabel = (raw: string | null | undefined): string => formatPokeApiText(raw);

  isTypeSelected(type: PokemonTypeName): boolean {
    return this.filters.types().includes(type);
  }

  isFlagActive(flag: FilterFlagKey): boolean {
    if (flag === 'onlyLegendary') return this.filters.onlyLegendary();
    if (flag === 'onlyMythical') return this.filters.onlyMythical();
    if (flag === 'onlyBaby') return this.filters.onlyBaby();
    return this.filters.excludeAlternateForms();
  }

  onGenerationChange(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    const parsed = Number.parseInt(raw, 10);
    this.filters.setGeneration(Number.isNaN(parsed) ? null : parsed);
  }

  onHabitatChange(event: Event): void {
    this.filters.setHabitat((event.target as HTMLSelectElement).value || null);
  }

  onColorChange(event: Event): void {
    this.filters.setColor((event.target as HTMLSelectElement).value || null);
  }

  onShapeChange(event: Event): void {
    this.filters.setShape((event.target as HTMLSelectElement).value || null);
  }

  onSortChange(event: Event): void {
    this.filters.setSortBy((event.target as HTMLSelectElement).value as CatalogSortOption);
  }

  onMinBstInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.filters.setMinBst(raw ? Number(raw) : 0);
  }

  onPanelKeyDown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.filters.closePanel();
    }
  }

  onRetry(event: Event): void {
    event.stopPropagation();
    this.filters.ensureLoaded(true);
  }
}
