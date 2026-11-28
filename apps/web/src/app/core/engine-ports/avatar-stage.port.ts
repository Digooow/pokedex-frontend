import { InjectionToken } from '@angular/core';
import type { CharacterBodyModel, CharacterOriginKey, HardwareTier } from '@pokeverse/shared';

export interface CharacterHologramClipInfo {
  readonly index: number;
  readonly label: string;
}

export type CharacterHologramMediaKind =
  'loading' | 'glb-animated' | 'glb-procedural' | 'fallback-2d';

export interface CharacterHologramMediaState {
  readonly kind: CharacterHologramMediaKind;
  readonly animations: readonly CharacterHologramClipInfo[];
  readonly activeAnimationIndex: number;
}

export interface CharacterHologramSceneOptions {
  readonly canvas: HTMLCanvasElement;
  readonly tier: HardwareTier;
  readonly reducedMotion: boolean;
  readonly autoRotate: boolean;
  readonly bodyModel: CharacterBodyModel;
  readonly originKey: CharacterOriginKey;
  readonly enablePhysics?: boolean;
  readonly onMediaStateChange?: (media: CharacterHologramMediaState) => void;
  readonly onContextLost: () => void;
  readonly onLowFps: () => void;
}

export interface CharacterHologramSceneController {
  readonly setBodyModel: (bodyModel: CharacterBodyModel) => void;
  readonly setOriginKey: (originKey: CharacterOriginKey) => void;
  readonly selectAnimation: (index: number) => void;
  readonly setAutoRotate: (enabled: boolean) => void;
  readonly setReducedMotion: (reduced: boolean) => void;
  readonly nudgeOrbit: (deltaRad: number) => void;
  readonly resetCamera: () => void;
  readonly resize: () => void;
  readonly dispose: () => void;
}

export type CharacterHologramMounter = (
  options: CharacterHologramSceneOptions,
) => CharacterHologramSceneController;

export const CHARACTER_HOLOGRAM_MOUNTER = new InjectionToken<
  () => Promise<CharacterHologramMounter>
>('CHARACTER_HOLOGRAM_MOUNTER', {
  providedIn: 'root',
  factory: () => async () =>
    (await import('../../features/character-studio/services/character-hologram-babylon.renderer'))
      .mountCharacterHologramScene,
});
