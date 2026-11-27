import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { POKEAPI_SPRITE_BASE } from '../../testing/pokemon-bundle-fixture.spec-helper';
import { MuseumStore } from './museum.store';
import { RegionsAtlasPanelComponent } from './regions-atlas-panel.component';

function createRegionPayload(name: string, pokedexName: string, locationName: string) {
  return {
    cache: 'hit',
    region: {
      id: 1,
      name,
      mainGeneration: 'generation-i',
      pokedexes: [{ id: 2, name: pokedexName }],
      versionGroups: ['red-blue'],
      locations: [
        { id: 10, name: locationName },
        { id: 11, name: 'cerulean-city' },
      ],
    },
  };
}

function createRegionalPokedexPayload(name: string) {
  return {
    cache: 'hit',
    pokedex: {
      id: 2,
      name,
      isMainSeries: true,
      region: 'kanto',
      description: 'Pokédex regional de Kanto',
      versionGroups: ['red-blue'],
      totalEntries: 2,
      entries: [
        {
          entryNumber: 1,
          speciesId: 1,
          speciesName: 'bulbasaur',
          artworkUrl: `${POKEAPI_SPRITE_BASE}/other/official-artwork/1.png`,
        },
        {
          entryNumber: 25,
          speciesId: 25,
          speciesName: 'pikachu',
          artworkUrl: `${POKEAPI_SPRITE_BASE}/other/official-artwork/25.png`,
        },
      ],
    },
  };
}

describe('RegionsAtlasPanelComponent & MuseumStore', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegionsAtlasPanelComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('renders single timeline 1996-2022 without duplicated region cards and loads live Kanto data', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const museum = TestBed.inject(MuseumStore);
    const fixture = TestBed.createComponent(RegionsAtlasPanelComponent);
    fixture.detectChanges();

    httpMock
      .expectOne('/api/v1/pokedex/regions/kanto')
      .flush(createRegionPayload('kanto', 'kanto', 'pallet-town'));
    httpMock
      .expectOne('/api/v1/pokedex/pokedexes/kanto')
      .flush(createRegionalPokedexPayload('kanto'));
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('.region-card')).toHaveLength(0);
    expect(host.querySelectorAll('.timeline-step')).toHaveLength(9);
    expect(host.textContent).toContain('Pallet Town');
    expect(host.textContent).toContain('Bulbasaur');
    expect(host.textContent).toContain('Red Blue');

    museum.setLocationQuery('cerulean');
    fixture.detectChanges();
    expect(host.querySelectorAll('.location-chip')).toHaveLength(1);
    expect(host.textContent).toContain('Cerulean City');

    const johtoStep = Array.from(host.querySelectorAll('.timeline-step')).find((el) =>
      el.textContent?.includes('Johto'),
    ) as HTMLButtonElement;
    johtoStep.click();
    fixture.detectChanges();

    httpMock
      .expectOne('/api/v1/pokedex/regions/johto')
      .flush(createRegionPayload('johto', 'original-johto', 'ecruteak-city'));
    httpMock
      .expectOne('/api/v1/pokedex/pokedexes/original-johto')
      .flush(createRegionalPokedexPayload('original-johto'));
    fixture.detectChanges();
    expect(host.textContent).toContain('Ecruteak City');

    const kantoStep = host.querySelector('.timeline-step') as HTMLButtonElement;
    kantoStep.click();
    fixture.detectChanges();
    httpMock.expectNone('/api/v1/pokedex/regions/kanto');
  });

  it('handles region error with retry and emits in-Pokédex navigation events', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(RegionsAtlasPanelComponent);
    const pokemonEvents: string[] = [];
    const holocronEvents: string[] = [];
    const locationEvents: string[] = [];
    const pokedexEvents: string[] = [];
    fixture.componentInstance.pokemonSelected.subscribe((name) => pokemonEvents.push(name));
    fixture.componentInstance.holocronRequested.subscribe((name) => holocronEvents.push(name));
    fixture.componentInstance.locationSelected.subscribe((name) => locationEvents.push(name));
    fixture.componentInstance.pokedexSelected.subscribe((name) => pokedexEvents.push(name));
    fixture.detectChanges();

    httpMock
      .expectOne('/api/v1/pokedex/regions/kanto')
      .flush(null, { status: 503, statusText: 'Down' });
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const retryBtn = host.querySelector('.inspector-error button') as HTMLButtonElement;
    expect(retryBtn).not.toBeNull();
    retryBtn.click();
    fixture.detectChanges();

    httpMock
      .expectOne('/api/v1/pokedex/regions/kanto')
      .flush(createRegionPayload('kanto', 'kanto', 'pallet-town'));
    httpMock
      .expectOne('/api/v1/pokedex/pokedexes/kanto')
      .flush(createRegionalPokedexPayload('kanto'));
    fixture.detectChanges();

    (host.querySelector('.species-link') as HTMLButtonElement).click();
    (host.querySelector('.species-holocron-btn') as HTMLButtonElement).click();
    (host.querySelector('.location-chip') as HTMLButtonElement).click();
    (host.querySelector('.inspector-chip--link') as HTMLButtonElement).click();

    expect(pokemonEvents).toEqual(['bulbasaur']);
    expect(holocronEvents).toEqual(['bulbasaur']);
    expect(locationEvents).toEqual(['pallet-town']);
    expect(pokedexEvents).toEqual(['kanto']);
  });
});
