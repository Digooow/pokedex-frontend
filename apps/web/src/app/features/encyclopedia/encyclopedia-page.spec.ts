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
});
