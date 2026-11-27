import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EncyclopediaStore } from './encyclopedia.store';
import { PokedexEncyclopediaPanelComponent } from '../pokedex-device/components/visor-modes/pokedex-encyclopedia-panel.component';
import {
  createCachedMoveDetailFixture,
  createCachedTypeDetailFixture,
  createEncyclopediaMovesListFixture,
  createEncyclopediaNaturesListFixture,
  createEncyclopediaTypesListFixture,
} from '../../testing/visor-fixtures.spec-helper';

describe('PokedexEncyclopediaPanelComponent (Embedded Encyclopedia)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PokedexEncyclopediaPanelComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('loads moves list, inspects move detail with embedded reverse Pokemon callback, and switches to natures/types', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PokedexEncyclopediaPanelComponent);
    const store = fixture.debugElement.injector.get(EncyclopediaStore);
    const selectedEvents: string[] = [];
    fixture.componentInstance.pokemonSelected.subscribe((name) => selectedEvents.push(name));
    fixture.detectChanges();

    httpMock
      .expectOne('/api/v1/pokedex/moves?limit=24&offset=0&q=')
      .flush(createEncyclopediaMovesListFixture());
    fixture.detectChanges();

    const hostEl = fixture.nativeElement as HTMLElement;
    const listButtons = hostEl.querySelectorAll('.ency-list-item') as NodeListOf<HTMLButtonElement>;
    expect(listButtons.length).toBeGreaterThanOrEqual(2);

    listButtons[0]?.click();
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/moves/thunder-shock')
      .flush(createCachedMoveDetailFixture('thunder-shock'));
    fixture.detectChanges();

    expect(hostEl.querySelector('.ency-card__title')?.textContent).toContain('Thunder Shock');
    expect(hostEl.querySelector('.ency-badge[data-pokemon-type="electric"]')).not.toBeNull();
    const reverseBtn = hostEl.querySelector('.ency-reverse-link--btn') as HTMLButtonElement;
    expect(reverseBtn).not.toBeNull();
    reverseBtn.click();
    expect(selectedEvents).toEqual(['pikachu']);

    store.setSearchQuery('bolt');
    store.submitSearch();
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/moves?limit=24&offset=0&q=bolt')
      .flush(createEncyclopediaMovesListFixture());
    fixture.detectChanges();

    const naturesBtn = Array.from(hostEl.querySelectorAll('.ency-cat-btn')).find((el) =>
      el.textContent?.includes('Naturezas'),
    ) as HTMLButtonElement;
    naturesBtn.click();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/pokedex/natures').flush(createEncyclopediaNaturesListFixture());
    fixture.detectChanges();
    expect(hostEl.textContent).toContain('Adamant');

    const typesBtn = Array.from(hostEl.querySelectorAll('.ency-cat-btn')).find((el) =>
      el.textContent?.includes('Tipos'),
    ) as HTMLButtonElement;
    typesBtn.click();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/pokedex/types').flush(null, { status: 503, statusText: 'Down' });
    fixture.detectChanges();
    expect(hostEl.querySelector('.ency-list-state--error')).not.toBeNull();

    (hostEl.querySelector('.ency-list-state--error .ency-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/pokedex/types').flush(createEncyclopediaTypesListFixture());
    fixture.detectChanges();

    const electricBtn = hostEl.querySelector('.ency-list-item') as HTMLButtonElement;
    electricBtn.click();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/pokedex/types/electric').flush(createCachedTypeDetailFixture());
    fixture.detectChanges();
    expect(hostEl.querySelector('.ency-card__title')?.textContent).toContain('Electric');
    expect(hostEl.querySelectorAll('.ency-badge[data-pokemon-type]').length).toBeGreaterThan(0);
  });

  it('unifies Regions & History atlas inside Enciclopédia and transitions to location details even when initialCategory is region', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PokedexEncyclopediaPanelComponent);
    fixture.componentRef.setInput('initialCategory', 'region');
    const selectedPokemon: string[] = [];
    const holocronRequests: string[] = [];
    fixture.componentInstance.pokemonSelected.subscribe((name) => selectedPokemon.push(name));
    fixture.componentInstance.holocronRequested.subscribe((name) => holocronRequests.push(name));
    fixture.detectChanges();

    httpMock.expectNone('/api/v1/pokedex/regions?limit=24&offset=0&q=');
    httpMock.expectOne('/api/v1/pokedex/regions/kanto').flush({
      cache: 'hit',
      region: {
        id: 1,
        name: 'kanto',
        mainGeneration: 'generation-i',
        pokedexes: [{ id: 2, name: 'kanto' }],
        versionGroups: ['red-blue'],
        locations: [{ id: 10, name: 'pallet-town' }],
      },
    });
    httpMock.expectOne('/api/v1/pokedex/pokedexes/kanto').flush({
      cache: 'hit',
      pokedex: {
        id: 2,
        name: 'kanto',
        isMainSeries: true,
        region: 'kanto',
        description: 'Pokédex regional de Kanto',
        versionGroups: ['red-blue'],
        totalEntries: 1,
        entries: [
          {
            entryNumber: 1,
            speciesId: 1,
            speciesName: 'bulbasaur',
            artworkUrl:
              'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png',
          },
        ],
      },
    });
    fixture.detectChanges();

    const hostEl = fixture.nativeElement as HTMLElement;
    expect(hostEl.querySelectorAll('.timeline-step')).toHaveLength(9);
    expect(hostEl.querySelector('.inspector')?.textContent).toContain('Pallet Town');

    (hostEl.querySelector('.species-link') as HTMLButtonElement).click();
    (hostEl.querySelector('.species-holocron-btn') as HTMLButtonElement).click();
    expect(selectedPokemon).toEqual(['bulbasaur']);
    expect(holocronRequests).toEqual(['bulbasaur']);

    (hostEl.querySelector('.location-chip') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/pokedex/locations?limit=24&offset=0&q=').flush({
      cache: 'hit',
      resource: 'location',
      total: 1,
      limit: 24,
      offset: 0,
      hasMore: false,
      items: [{ id: 10, name: 'pallet-town', displayName: 'Pallet Town', subtitle: 'kanto' }],
    });
    httpMock.expectOne('/api/v1/pokedex/locations/pallet-town').flush({
      cache: 'hit',
      location: {
        id: 10,
        name: 'pallet-town',
        localizedName: 'Pallet Town',
        region: 'kanto',
        generations: ['generation-i'],
        areas: [],
      },
    });
    fixture.detectChanges();

    expect(hostEl.querySelector('.ency-card__title')?.textContent).toContain('Pallet Town');
  });
});
