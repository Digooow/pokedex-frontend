import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  POKEAPI_SPRITE_BASE,
  createCachedPokemonBundleFixture,
} from '../../testing/pokemon-bundle-fixture.spec-helper';
import { HolocronStore } from '../holocron/holocron.store';
import { MuseumPageComponent } from './museum-page.component';
import { MuseumStore } from './museum.store';

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

describe('MuseumPageComponent & MuseumStore', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MuseumPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('renders 9 regions, timeline 1996-2022, and loads live Kanto region + regional pokedex', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const museum = TestBed.inject(MuseumStore);
    const fixture = TestBed.createComponent(MuseumPageComponent);
    fixture.detectChanges();

    httpMock
      .expectOne('/api/v1/pokedex/regions/kanto')
      .flush(createRegionPayload('kanto', 'kanto', 'pallet-town'));
    httpMock
      .expectOne('/api/v1/pokedex/pokedexes/kanto')
      .flush(createRegionalPokedexPayload('kanto'));
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('.region-card')).toHaveLength(9);
    expect(host.querySelectorAll('.timeline-step')).toHaveLength(9);
    expect(host.textContent).toContain('Pallet Town');
    expect(host.textContent).toContain('Bulbasaur');

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

  it('handles region error with retry and opens HolocronStore from starter action', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const holocron = TestBed.inject(HolocronStore);
    const fixture = TestBed.createComponent(MuseumPageComponent);
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

    const holocronBtn = host.querySelector('.species-holocron-btn') as HTMLButtonElement;
    holocronBtn.click();
    expect(holocron.dialogOpen()).toBe(true);
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/bulbasaur/bundle')
      .flush(createCachedPokemonBundleFixture({ id: 1, name: 'bulbasaur', typeName: 'grass' }));
    expect(holocron.pokemonState().status).toBe('success');
  });
});
