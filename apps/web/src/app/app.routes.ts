import { type Route, type Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import type { UnderConstructionModuleId } from './features/under-construction/under-construction.data';

const loadPokedexDevice = () =>
  import('./features/pokedex-device/pokedex-device.component').then(
    (m) => m.PokedexDevicePageComponent,
  );

const loadUnderConstruction = () =>
  import('./features/under-construction/under-construction.component').then(
    (m) => m.UnderConstructionComponent,
  );

function pokedexRoute(path: '' | 'pokedex'): Route {
  return {
    path,
    ...(path === '' ? { pathMatch: 'full' as const } : {}),
    title: 'Pokédex 3D — PokéVerse OS',
    data: { initialCoverOpen: false },
    loadComponent: loadPokedexDevice,
  };
}

function trainerModuleRoute(
  path: string,
  title: string,
  moduleId: UnderConstructionModuleId,
): Route {
  return {
    path,
    title,
    canActivate: [authGuard],
    data: { moduleId },
    loadComponent: loadUnderConstruction,
  };
}

export const routes: Routes = [
  pokedexRoute(''),
  pokedexRoute('pokedex'),
  {
    path: 'museu',
    title: 'Museu das Regiões — PokéVerse OS',
    loadComponent: () =>
      import('./features/regions-museum/museum-page.component').then((m) => m.MuseumPageComponent),
  },
  {
    path: 'enciclopedia',
    title: 'Enciclopédia Global — PokéVerse OS',
    loadComponent: () =>
      import('./features/encyclopedia/encyclopedia-page.component').then(
        (m) => m.EncyclopediaPageComponent,
      ),
  },
  trainerModuleRoute('mundo', 'Vila Central — PokéVerse OS', 'overworld'),
  trainerModuleRoute('arcade', 'Arcade Retrô 3D — PokéVerse OS', 'arcade'),
  trainerModuleRoute('arena', 'Battle Frontier — PokéVerse OS', 'arena'),
  {
    path: '**',
    redirectTo: '',
  },
];
