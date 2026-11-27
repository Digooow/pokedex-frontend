import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { POKEMON_TYPES, type PokemonTypeName, formatPokeApiText } from '@pokeverse/shared';
import {
  DEFAULT_GENERATION_OPTIONS,
  type FilterPanelTab,
  GAME_FILTER_OPTIONS,
  QUICK_ABILITY_PRESETS,
  QUICK_MOVE_PRESETS,
  REGION_FILTER_OPTIONS,
  formatEggGroupLabelPt,
  formatHabitatLabelPt,
  formatTypeLabelPt,
  stepFilterTab,
} from '../services/pokedex-attribute-search.util';
import {
  type CatalogSortOption,
  type FilterFlagKey,
  PokedexFiltersStore,
} from '../services/pokedex-filters.store';

export type { FilterPanelTab } from '../services/pokedex-attribute-search.util';

@Component({
  selector: 'pv-pokedex-filters-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: block; flex-shrink: 0; }'],
  templateUrl: './pokedex-filters-panel.component.html',
})
export class PokedexFiltersPanelComponent {
  readonly filters = inject(PokedexFiltersStore);
  readonly activeTab = signal<FilterPanelTab>('primary');
  readonly moveDraft = signal('');
  readonly abilityDraft = signal('');

  readonly regionOptions = REGION_FILTER_OPTIONS;
  readonly gameOptions = GAME_FILTER_OPTIONS;
  readonly quickMoves = QUICK_MOVE_PRESETS;
  readonly quickAbilities = QUICK_ABILITY_PRESETS;

  readonly flagToggles: readonly { readonly key: FilterFlagKey; readonly label: string }[] = [
    { key: 'onlyLegendary', label: 'Lendário' },
    { key: 'onlyMythical', label: 'Mítico' },
    { key: 'onlyBaby', label: 'Bebê' },
    { key: 'excludeAlternateForms', label: 'Sem formas alt.' },
  ];

  constructor() {
    effect(() => this.moveDraft.set(this.filters.moveFilter() ?? ''));
    effect(() => this.abilityDraft.set(this.filters.abilityFilter() ?? ''));
  }

  readonly primaryActiveCount = computed(
    () =>
      this.filters.types().length +
      Number(this.filters.region() !== null) +
      Number(this.filters.game() !== null) +
      Number(this.filters.generation() !== null) +
      Number(this.filters.onlyLegendary()) +
      Number(this.filters.onlyMythical()) +
      Number(this.filters.onlyBaby()) +
      Number(this.filters.excludeAlternateForms()),
  );

  readonly attributesActiveCount = computed(
    () =>
      Number(this.filters.eggGroup() !== null) +
      Number(this.filters.moveFilter() !== null) +
      Number(this.filters.abilityFilter() !== null),
  );

  readonly taxonomyActiveCount = computed(
    () =>
      Number(this.filters.sortBy() !== 'id-asc') +
      Number(this.filters.minBst() > 0) +
      Number(this.filters.habitat() !== null) +
      Number(this.filters.color() !== null) +
      Number(this.filters.shape() !== null),
  );

  readonly availableTypes = computed<readonly PokemonTypeName[]>(() => {
    const meta = this.filters.metaState();
    if (meta.status !== 'success') return POKEMON_TYPES;
    const allowed = new Set<string>(POKEMON_TYPES);
    const filtered: readonly PokemonTypeName[] = meta.data.types
      .map((item) => item.name.toLowerCase())
      .filter((name): name is PokemonTypeName => allowed.has(name));
    return filtered.length > 0 ? filtered : POKEMON_TYPES;
  });

  readonly generationOptions = computed(() => {
    const meta = this.filters.metaState();
    return meta.status === 'success' && meta.data.generations.length > 0
      ? meta.data.generations
      : DEFAULT_GENERATION_OPTIONS;
  });

  readonly eggGroupOptions = computed(() => this.metaList('eggGroups'));
  readonly habitatOptions = computed(() => this.metaList('habitats'));
  readonly colorOptions = computed(() => this.metaList('colors'));
  readonly shapeOptions = computed(() => this.metaList('shapes'));

  readonly formatLabel = (raw: string | null | undefined): string => formatPokeApiText(raw);
  readonly formatTypePt = (type: PokemonTypeName): string => formatTypeLabelPt(type);
  readonly formatEggGroupPt = (slug: string): string => formatEggGroupLabelPt(slug);
  readonly formatHabitatPt = (slug: string): string => formatHabitatLabelPt(slug);
  isTypeSelected = (type: PokemonTypeName): boolean => this.filters.types().includes(type);

  isFlagActive(flag: FilterFlagKey): boolean {
    if (flag === 'onlyLegendary') return this.filters.onlyLegendary();
    if (flag === 'onlyMythical') return this.filters.onlyMythical();
    if (flag === 'onlyBaby') return this.filters.onlyBaby();
    return this.filters.excludeAlternateForms();
  }

  onGenerationChange(event: Event): void {
    const parsed = Number.parseInt((event.target as HTMLSelectElement).value, 10);
    this.filters.setGeneration(Number.isNaN(parsed) ? null : parsed);
  }

  onRegionChange = (e: Event) => this.filters.setRegion(this.readValue(e) || null);
  onGameChange = (e: Event) => this.filters.setGame(this.readValue(e) || null);
  onEggGroupChange = (e: Event) => this.filters.setEggGroup(this.readValue(e) || null);
  onHabitatChange = (e: Event) => this.filters.setHabitat(this.readValue(e) || null);
  onColorChange = (e: Event) => this.filters.setColor(this.readValue(e) || null);
  onShapeChange = (e: Event) => this.filters.setShape(this.readValue(e) || null);
  onSortChange = (e: Event) => this.filters.setSortBy(this.readValue(e) as CatalogSortOption);
  onMinBstInput = (e: Event) => this.filters.setMinBst(Number(this.readValue(e) || 0));
  onMoveDraftInput = (e: Event) => this.moveDraft.set(this.readValue(e));
  onAbilityDraftInput = (e: Event) => this.abilityDraft.set(this.readValue(e));

  onApplyMove(event: Event): void {
    event.preventDefault();
    this.filters.setMoveFilter(this.moveDraft().trim() || null);
  }

  onPickQuickMove(slug: string): void {
    const next = this.filters.moveFilter() === slug ? null : slug;
    this.moveDraft.set(next ?? '');
    this.filters.setMoveFilter(next);
  }

  onApplyAbility(event: Event): void {
    event.preventDefault();
    this.filters.setAbilityFilter(this.abilityDraft().trim() || null);
  }

  onPickQuickAbility(slug: string): void {
    const next = this.filters.abilityFilter() === slug ? null : slug;
    this.abilityDraft.set(next ?? '');
    this.filters.setAbilityFilter(next);
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

  onResetAll(): void {
    this.moveDraft.set('');
    this.abilityDraft.set('');
    this.filters.resetFilters();
  }

  selectTab = (tab: FilterPanelTab) => this.activeTab.set(tab);

  onTabKeyDown(event: KeyboardEvent): void {
    const next = stepFilterTab(this.activeTab(), event.key);
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    this.activeTab.set(next);
  }

  private readValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  private metaList(key: 'eggGroups' | 'habitats' | 'colors' | 'shapes') {
    const meta = this.filters.metaState();
    return meta.status === 'success' ? meta.data[key] : [];
  }
}
