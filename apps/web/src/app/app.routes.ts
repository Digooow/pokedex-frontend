import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Pokédex 3D — PokéVerse OS',
    data: { initialCoverOpen: false },
    loadComponent: () =>
      import('./features/pokedex-device/pokedex-device.component').then(
        (m) => m.PokedexDevicePageComponent,
      ),
  },
  {
    path: 'pokedex',
    title: 'Pokédex 3D — PokéVerse OS',
    data: { initialCoverOpen: false },
    loadComponent: () =>
      import('./features/pokedex-device/pokedex-device.component').then(
        (m) => m.PokedexDevicePageComponent,
      ),
  },
  {
    path: 'museu',
    title: 'Museu das Regiões — PokéVerse OS',
    loadComponent: () =>
      import('./features/regions-museum/museum-page.component').then(
        (m) => m.MuseumPageComponent,
      ),
  },
  {
    path: 'mundo',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/title-screen/title-screen.component').then(
        (m) => m.TitleScreenComponent,
      ),
  },
  {
    path: 'arcade',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/title-screen/title-screen.component').then(
        (m) => m.TitleScreenComponent,
      ),
  },
  {
    path: 'arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/title-screen/title-screen.component').then(
        (m) => m.TitleScreenComponent,
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
