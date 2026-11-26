import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
import { PokedexHolocronPanelComponent } from '../pokedex-device/components/visor-modes/pokedex-holocron-panel.component';
import { mapPokemonBundleToView } from '../pokedex-device/services/pokedex-view-mapper.util';
import { resolveHolocronPalette, resolveHolocronTextures } from './holocron-palette.util';
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
      imports: [PokedexHolocronPanelComponent, CrySpectrogramComponent],
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

  it('resolves elemental palettes, dual-face textures, renders 2D fallback in LITE mode, toggles shiny, and emits evolution click', () => {
    const electricPalette = resolveHolocronPalette(['Electric']);
    const dualPalette = resolveHolocronPalette(['Fire', 'Flying']);
    expect(electricPalette.primary).toBe(0xfacc15);
    expect(dualPalette.secondary).toBe(0x93c5fd);

    const quality = TestBed.inject(QualityStore);
    quality.setPreference('lite');

    const holocron = TestBed.inject(HolocronStore);
    const pikachuView = mapPokemonBundleToView(
      createCachedPokemonBundleFixture({ id: 25, name: 'pikachu', typeName: 'electric' }).bundle,
    );
    const textures = resolveHolocronTextures(pikachuView, false);
    expect(textures.frontUrl).toContain('/25.png');

    holocron.openWithPokemon(pikachuView);

    const fixture = TestBed.createComponent(PokedexHolocronPanelComponent);
    const selectedEvo: string[] = [];
    fixture.componentInstance.selectSpecies.subscribe((s) => selectedEvo.push(s));
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.holocron-stage__mode')?.textContent).toContain('Modo 2D · LITE');
    expect(host.querySelector('.holocron-embed__title')?.textContent).toContain('Pikachu');

    const shinyBtn = Array.from(host.querySelectorAll('.holocron-ctrl-btn')).find((b) =>
      b.textContent?.includes('Shiny'),
    ) as HTMLButtonElement;
    shinyBtn.click();
    fixture.detectChanges();
    expect(holocron.shiny()).toBe(true);
    expect((host.querySelector('.holocron-stage__sprite') as HTMLImageElement).src).toContain(
      '/shiny/',
    );

    const evoButtons = host.querySelectorAll(
      '.holocron-embed__evo-row .holocron-embed__btn',
    ) as NodeListOf<HTMLButtonElement>;
    evoButtons[1]?.click();
    expect(selectedEvo).toEqual(['raichu']);
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

    const fixture = TestBed.createComponent(PokedexHolocronPanelComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.holocron-stage__mode')?.textContent).toContain(
      'Modo 2D · Fallback',
    );
    expect(host.querySelector('.holocron-stage__sprite')).not.toBeNull();
  });
});
