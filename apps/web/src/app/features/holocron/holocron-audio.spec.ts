import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AudioEngineService } from '../../core/audio/audio-engine.service';
import {
  AUDIO_MUTED_STORAGE_KEY,
  AUDIO_SFX_STORAGE_KEY,
  AudioStore,
} from '../../core/stores/audio.store';
import { PrivacyConsentStore } from '../../core/stores/privacy-consent.store';
import { QualityStore } from '../../core/stores/quality.store';
import { CrySpectrogramComponent } from '../../shared/components/cry-spectrogram.component';
import { createCachedPokemonBundleFixture } from '../../testing/pokemon-bundle-fixture.spec-helper';
import { mapPokemonBundleToView } from '../pokedex-device/services/pokedex-view-mapper.util';
import { HolocronDialogComponent } from './holocron-dialog.component';
import { resolveHolocronPalette } from './holocron-palette.util';
import { HolocronStore } from './holocron.store';

function resetAudioStorage(): void {
  document.cookie = 'pokeverse_consent=; Path=/; Max-Age=0';
  window.localStorage.removeItem(AUDIO_MUTED_STORAGE_KEY);
  window.localStorage.removeItem(AUDIO_SFX_STORAGE_KEY);
}

describe('Holocron 3D & Web Audio Engine', () => {
  beforeEach(async () => {
    resetAudioStorage();
    await TestBed.configureTestingModule({
      imports: [HolocronDialogComponent, CrySpectrogramComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    resetAudioStorage();
  });

  it('registers AudioStore keys in PrivacyConsentStore and purges them on essential-only choice', () => {
    const privacy = TestBed.inject(PrivacyConsentStore);
    const audio = TestBed.inject(AudioStore);
    audio.setMuted(true);
    audio.setSfxEnabled(false);

    expect(window.localStorage.getItem(AUDIO_MUTED_STORAGE_KEY)).toBe('true');
    expect(window.localStorage.getItem(AUDIO_SFX_STORAGE_KEY)).toBe('false');

    privacy.acceptEssentialOnly();
    expect(window.localStorage.getItem(AUDIO_MUTED_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(AUDIO_SFX_STORAGE_KEY)).toBeNull();
  });

  it('blocks cry playback when muted, generates deterministic spectrogram levels, and renders CrySpectrogramComponent', () => {
    const audioStore = TestBed.inject(AudioStore);
    const engine = TestBed.inject(AudioEngineService);
    const quality = TestBed.inject(QualityStore);
    quality.setPreference('lite');

    audioStore.setMuted(true);
    engine.playCry(
      'latest',
      'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/25.ogg',
    );
    expect(audioStore.activeCryKind()).toBeNull();
    expect(audioStore.cryError()).toContain('silenciado');

    audioStore.setMuted(false);
    audioStore.setCryPlaybackState('latest', null);
    const activeLevels = engine.readFrequencyLevels(10, 420);
    expect(activeLevels).toHaveLength(10);
    expect(activeLevels.every((v) => v >= 0.14 && v <= 1)).toBe(true);
    expect(engine.readEnergyLevel(420)).toBeGreaterThan(0);

    const specFixture = TestBed.createComponent(CrySpectrogramComponent);
    specFixture.componentRef.setInput('active', true);
    specFixture.detectChanges();
    expect((specFixture.nativeElement as HTMLElement).textContent).toContain('Espectro ativo');
    engine.stopCry();
  });

  it('resolves elemental palettes, renders 2D fallback in LITE mode, toggles shiny, loads evolution, and navigates to Pokedex', () => {
    const electricPalette = resolveHolocronPalette(['Electric']);
    const dualPalette = resolveHolocronPalette(['Fire', 'Flying']);
    expect(electricPalette.primary).toBe(0xfacc15);
    expect(dualPalette.secondary).toBe(0x93c5fd);

    const httpMock = TestBed.inject(HttpTestingController);
    const quality = TestBed.inject(QualityStore);
    quality.setPreference('lite');

    const holocron = TestBed.inject(HolocronStore);
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const pikachuView = mapPokemonBundleToView(
      createCachedPokemonBundleFixture({ id: 25, name: 'pikachu', typeName: 'electric' }).bundle,
    );
    holocron.openWithPokemon(pikachuView);

    const fixture = TestBed.createComponent(HolocronDialogComponent);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.holocron-stage__mode')?.textContent).toContain('Modo 2D · LITE');
    expect(host.textContent).toContain('BST 320');

    const shinyBtn = Array.from(host.querySelectorAll('.holocron-ctrl-btn')).find((b) =>
      b.textContent?.includes('Shiny'),
    ) as HTMLButtonElement;
    shinyBtn.click();
    fixture.detectChanges();
    expect(holocron.shiny()).toBe(true);
    expect((host.querySelector('.holocron-stage__sprite') as HTMLImageElement).src).toContain(
      '/shiny/',
    );

    const evoButtons = host.querySelectorAll('.holocron-evo-btn') as NodeListOf<HTMLButtonElement>;
    evoButtons[1]?.click();
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/pokedex/pokemon/raichu/bundle')
      .flush(createCachedPokemonBundleFixture({ id: 26, name: 'raichu', typeName: 'electric' }));
    fixture.detectChanges();
    expect(host.querySelector('#holocron-dialog-title')?.textContent).toContain('Raichu');

    const openPokedexBtn = Array.from(host.querySelectorAll('.holocron-btn')).find((b) =>
      b.textContent?.includes('Abrir na Pokédex'),
    ) as HTMLButtonElement;
    openPokedexBtn.click();
    expect(holocron.dialogOpen()).toBe(false);
    expect(navSpy).toHaveBeenCalledWith(['/pokedex'], { queryParams: { q: 'raichu' } });
  });

  it('degrades gracefully to 2D fallback when webglcontextlost is signaled', () => {
    const quality = TestBed.inject(QualityStore);
    quality.setPreference('balanced');
    const holocron = TestBed.inject(HolocronStore);
    const pikachuView = mapPokemonBundleToView(
      createCachedPokemonBundleFixture({ id: 25, name: 'pikachu', typeName: 'electric' }).bundle,
    );
    holocron.openWithPokemon(pikachuView);
    holocron.markWebGlLost();

    const fixture = TestBed.createComponent(HolocronDialogComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.holocron-stage__mode')?.textContent).toContain(
      'Modo 2D · Fallback',
    );
    expect(host.querySelector('.holocron-stage__sprite')).not.toBeNull();
  });
});
