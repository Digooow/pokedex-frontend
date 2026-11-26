import { inject } from '@angular/core';
import { type Route, Router, type Routes } from '@angular/router';
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
  {
    path: '',
    pathMatch: 'full',
    title: 'PokéVerse OS — Iniciar',
    loadComponent: () =>
      import('./features/title-screen/title-screen.component').then((m) => m.TitleScreenComponent),
  },
  {
    path: 'inicio',
    title: 'Início — PokéVerse OS',
    loadComponent: () =>
      import('./features/home-hub/home-hub.component').then((m) => m.HomeHubComponent),
  },
  {
    path: 'pokedex',
    title: 'Pokédex 3D — PokéVerse OS',
    data: { initialCoverOpen: false },
    loadComponent: loadPokedexDevice,
  },
  {
    path: 'museu',
    title: 'Museu das Regiões — PokéVerse OS',
    loadComponent: () =>
      import('./features/regions-museum/museum-page.component').then((m) => m.MuseumPageComponent),
  },
  {
    path: 'enciclopedia',
    redirectTo: (activatedRoute) =>
      inject(Router).createUrlTree(['/pokedex'], {
        queryParams: {
          mode: 'enciclopedia',
          ...activatedRoute.queryParams,
        },
      }),
  },
  trainerModuleRoute('mundo', 'Vila Central — PokéVerse OS', 'overworld'),
  trainerModuleRoute('arcade', 'Arcade Retrô 3D — PokéVerse OS', 'arcade'),
  trainerModuleRoute('arena', 'Battle Frontier — PokéVerse OS', 'arena'),
  {
    path: '**',
    redirectTo: '',
  },
];
