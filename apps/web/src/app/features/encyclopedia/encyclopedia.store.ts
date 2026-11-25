import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import type { AsyncState } from '@pokeverse/shared';
import {
  ENCYCLOPEDIA_RESOURCE_KEYS,
  type EncyclopediaResourceKey,
} from '@pokeverse/shared/pokedex-encyclopedia';
import { Subscription } from 'rxjs';
import { EncyclopediaApiClient } from './encyclopedia-api.client';
import {
  ENCYCLOPEDIA_CATEGORY_MAP,
  type EncyclopediaDetailPayload,
  type EncyclopediaListView,
} from './encyclopedia-catalog.config';

const PAGE_LIMIT = 24;

@Injectable()
export class EncyclopediaStore implements OnDestroy {
  private readonly apiClient = inject(EncyclopediaApiClient);
  private readonly listCache = new Map<string, EncyclopediaListView>();
  private readonly detailCache = new Map<string, EncyclopediaDetailPayload>();
  private listSub: Subscription | null = null;
  private detailSub: Subscription | null = null;

  readonly activeCategory = signal<EncyclopediaResourceKey>('move');
  readonly searchQuery = signal('');
  readonly committedQuery = signal('');
  readonly offset = signal(0);
  readonly selectedName = signal<string | null>(null);

  readonly listState = signal<AsyncState<EncyclopediaListView>>({ status: 'idle' });
  readonly detailState = signal<AsyncState<EncyclopediaDetailPayload>>({
    status: 'empty',
    reason: 'Selecione um registro na lista para consultar detalhes e busca reversa.',
  });

  readonly categoryConfig = computed(() => ENCYCLOPEDIA_CATEGORY_MAP[this.activeCategory()]);
  readonly currentPage = computed(() => Math.floor(this.offset() / PAGE_LIMIT) + 1);
  readonly totalPages = computed(() => {
    const state = this.listState();
    if (state.status !== 'success' || state.data.total === 0) return 1;
    return Math.ceil(state.data.total / PAGE_LIMIT);
  });

  initFromParams(catParam: string | null, itemParam: string | null): void {
    const allowed = new Set<string>(ENCYCLOPEDIA_RESOURCE_KEYS);
    const nextCat =
      catParam && allowed.has(catParam) ? (catParam as EncyclopediaResourceKey) : 'move';
    this.activeCategory.set(nextCat);
    this.offset.set(0);
    this.committedQuery.set('');
    this.searchQuery.set('');
    this.loadList();

    if (itemParam?.trim()) {
      this.selectItem(itemParam.trim().toLowerCase());
    }
  }

  selectCategory(category: EncyclopediaResourceKey): void {
    if (this.activeCategory() === category && this.listState().status === 'success') return;
    this.activeCategory.set(category);
    this.offset.set(0);
    this.committedQuery.set('');
    this.searchQuery.set('');
    this.selectedName.set(null);
    this.detailSub?.unsubscribe();
    this.detailState.set({
      status: 'empty',
      reason: 'Selecione um registro na lista para consultar detalhes e busca reversa.',
    });
    this.loadList();
  }

  setSearchQuery(value: string): void {
    this.searchQuery.set(value);
  }

  submitSearch(): void {
    this.offset.set(0);
    this.committedQuery.set(this.searchQuery().trim());
    this.loadList();
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.committedQuery.set('');
    this.offset.set(0);
    this.loadList();
  }

  nextPage(): void {
    const state = this.listState();
    if (state.status !== 'success' || !state.data.hasMore) return;
    this.offset.update((prev) => prev + PAGE_LIMIT);
    this.loadList();
  }

  prevPage(): void {
    if (this.offset() <= 0) return;
    this.offset.update((prev) => Math.max(0, prev - PAGE_LIMIT));
    this.loadList();
  }

  retryList(): void {
    this.loadList(true);
  }

  selectItem(name: string, force = false): void {
    const key = name.trim().toLowerCase();
    const category = this.activeCategory();
    if (!key) return;

    this.selectedName.set(key);
    const cacheKey = `${category}:${key}`;
    const cached = !force ? this.detailCache.get(cacheKey) : undefined;
    if (cached) {
      this.detailState.set({ status: 'success', data: cached });
      return;
    }

    this.detailSub?.unsubscribe();
    this.detailState.set({ status: 'loading' });
    this.detailSub = this.apiClient.fetchDetail(category, key).subscribe((payload) => {
      if (!payload) {
        this.detailState.set({
          status: 'error',
          error: {
            code: 'ENCYCLOPEDIA_DETAIL_UNAVAILABLE',
            message: 'Não foi possível carregar os detalhes deste registro.',
            retryable: true,
          },
        });
        return;
      }
      this.detailCache.set(cacheKey, payload);
      if (this.selectedName() === key && this.activeCategory() === category) {
        this.detailState.set({ status: 'success', data: payload });
      }
    });
  }

  retryDetail(): void {
    const current = this.selectedName();
    if (current) this.selectItem(current, true);
  }

  navigateRelated(category: EncyclopediaResourceKey, itemName: string): void {
    this.activeCategory.set(category);
    this.offset.set(0);
    this.searchQuery.set('');
    this.committedQuery.set('');
    this.loadList();
    this.selectItem(itemName);
  }

  ngOnDestroy(): void {
    this.listSub?.unsubscribe();
    this.detailSub?.unsubscribe();
  }

  private loadList(force = false): void {
    const category = this.activeCategory();
    const offset = this.offset();
    const q = this.committedQuery();
    const cacheKey = `${category}:${offset}:${q.toLowerCase()}`;

    const cached = !force ? this.listCache.get(cacheKey) : undefined;
    if (cached) {
      this.listState.set(
        cached.items.length > 0
          ? { status: 'success', data: cached }
          : { status: 'empty', reason: 'Nenhum registro encontrado para essa busca.' },
      );
      return;
    }

    this.listSub?.unsubscribe();
    this.listState.set({ status: 'loading' });
    this.listSub = this.apiClient
      .fetchList(category, { limit: PAGE_LIMIT, offset, q })
      .subscribe((res) => {
        if (!res) {
          this.listState.set({
            status: 'error',
            error: {
              code: 'ENCYCLOPEDIA_LIST_UNAVAILABLE',
              message: 'Não foi possível carregar a listagem da Enciclopédia.',
              retryable: true,
            },
          });
          return;
        }
        this.listCache.set(cacheKey, res);
        if (this.activeCategory() !== category || this.offset() !== offset) return;
        this.listState.set(
          res.items.length > 0
            ? { status: 'success', data: res }
            : { status: 'empty', reason: 'Nenhum registro encontrado para essa busca.' },
        );
      });
  }
}
