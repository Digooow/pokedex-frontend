import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  CHARACTER_INITIAL_PRESETS,
  type CharacterSheet,
  buildInitialAttributes,
  computeCharacterDerivedVitals,
  getCharacterOriginByKey,
} from '@pokeverse/shared';
import { AuthStore } from '../../core/stores/auth.store';
import { createTrainerFixture } from '../../testing/test-fixtures.spec-helper';
import { CharacterStudioPageComponent } from './character-studio-page.component';
import { CharacterStudioStore } from './services/character-studio.store';

function createCharacterSheetFixture(overrides?: Partial<CharacterSheet>): CharacterSheet {
  const balanced = CHARACTER_INITIAL_PRESETS[0];
  if (!balanced) {
    throw new Error('Missing default balanced preset.');
  }
  const attrs = buildInitialAttributes(balanced.allocation);
  const vitals = computeCharacterDerivedVitals(2, attrs);
  const origin = getCharacterOriginByKey('settler');
  const now = new Date().toISOString();

  return {
    id: '660e8400-e29b-41d4-a716-446655440000',
    accountId: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Kael Norte',
    originKey: origin.key,
    originLabel: origin.label,
    startingRegionName: origin.startingRegionName,
    classlessMode: true,
    appearance: {
      skinTone: 'ochre',
      hairStyle: 'short',
      hairColor: 'obsidian',
      outfitStyle: 'tunic',
      outfitColor: 'forest',
    },
    level: 2,
    totalSkillMilestones: 12,
    availableAttributePoints: 2,
    hexQ: origin.startingHex.q,
    hexR: origin.startingHex.r,
    hexZ: origin.startingHex.z,
    presenceMode: 'ONLINE',
    attributes: attrs,
    vitals: {
      hpCurrent: vitals.hpMax,
      hpMax: vitals.hpMax,
      staminaCurrent: vitals.staminaMax,
      staminaMax: vitals.staminaMax,
      manaCurrent: vitals.manaMax,
      manaMax: vitals.manaMax,
      hungerCurrent: 100,
      hungerMax: 100,
      thirstCurrent: 100,
      thirstMax: 100,
      fatigueCurrent: 0,
      fatigueMax: 100,
      carryCapacityKg: vitals.carryCapacityKg,
      starterKitWeightKg: 4.2,
      baseDodgeRating: vitals.baseDodgeRating,
      baseDetectionRadius: vitals.baseDetectionRadius,
      curseResistanceBase: vitals.curseResistanceBase,
      companionSlots: vitals.companionSlots,
    },
    starterKit: [...origin.starterKit],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('CharacterStudioPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CharacterStudioPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('allows visitor to customize appearance/attributes, preview sheet, and preserves draft on login prompt', () => {
    const fixture = TestBed.createComponent(CharacterStudioPageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.creator-classless-banner')?.textContent).toContain(
      'Sem Classes',
    );

    const store = TestBed.inject(CharacterStudioStore);
    store.setDraftName('Lyra Brisa');
    store.setDraftOrigin('harbor');
    store.updateAppearance({ hairStyle: 'braid', outfitColor: 'cobalt' });
    store.openVisitorPreview();
    fixture.detectChanges();

    expect(compiled.querySelector('.sheet-preview-banner')?.textContent).toContain(
      'Prévia de Visitante',
    );
    expect(compiled.querySelector('.char-portrait__name')?.textContent).toContain('Lyra Brisa');

    const auth = TestBed.inject(AuthStore);
    store.submitCreate();
    expect(auth.visitorPrompt()?.targetRoute).toBe('/personagem');
    expect(store.draftName()).toBe('Lyra Brisa');
    expect(store.draftOriginKey()).toBe('harbor');
  });

  it('handles loading, error+retry, creation, and atomic attribute allocation when authenticated', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const auth = TestBed.inject(AuthStore);
    auth.login({ email: 'red@pokeverse.dev', password: 'Password1234!' });
    httpMock.expectOne('/api/v1/auth/login').flush({
      authenticated: true,
      sessionState: 'AUTHENTICATED',
      mfaMethods: [],
      expiresInSec: 900,
      trainer: createTrainerFixture(),
    });

    const fixture = TestBed.createComponent(CharacterStudioPageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const listReqFail = httpMock.expectOne('/api/v1/characters?limit=20&offset=0');
    expect(compiled.querySelector('.studio-skeleton')).not.toBeNull();
    listReqFail.flush({ message: 'Falha temporária' }, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();

    expect(compiled.querySelector('.studio-state__msg')?.textContent).toContain('Falha temporária');
    (compiled.querySelector('.studio-state button') as HTMLButtonElement).click();
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/characters?limit=20&offset=0').flush({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    fixture.detectChanges();

    const store = TestBed.inject(CharacterStudioStore);
    store.setDraftName('Kael Norte');
    store.submitCreate();
    fixture.detectChanges();

    const createReq = httpMock.expectOne('/api/v1/characters');
    expect(createReq.request.method).toBe('POST');
    const createdSheet = createCharacterSheetFixture();
    createReq.flush(createdSheet);
    fixture.detectChanges();

    expect(compiled.querySelector('.sheet-hero')).not.toBeNull();
    expect(compiled.querySelector('.char-portrait__name')?.textContent).toContain('Kael Norte');

    const plusBtn = compiled.querySelector(
      'button[aria-label="Adicionar ponto em Físico"]',
    ) as HTMLButtonElement;
    plusBtn.click();
    fixture.detectChanges();

    const confirmBtn = Array.from(compiled.querySelectorAll('.sheet-alloc-actions button')).find(
      (btn) => btn.textContent?.includes('Confirmar Alocação'),
    ) as HTMLButtonElement;
    confirmBtn.click();
    fixture.detectChanges();

    const allocReq = httpMock.expectOne(
      `/api/v1/characters/${createdSheet.id}/attributes/allocate`,
    );
    expect(allocReq.request.method).toBe('POST');
    allocReq.flush(
      createCharacterSheetFixture({
        availableAttributePoints: 1,
        attributes: {
          ...createdSheet.attributes,
          physique: createdSheet.attributes.physique + 1,
        },
      }),
    );
    fixture.detectChanges();

    expect(compiled.querySelector('.sheet-card__head .pv-badge')?.textContent).toContain(
      'Pontos livres: 1',
    );
  });
});
