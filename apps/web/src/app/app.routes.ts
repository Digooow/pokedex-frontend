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
      import('./features/regions-museum/museum-page.component').then((m) => m.MuseumPageComponent),
  },
  {
    path: 'mundo',
    title: 'Vila Central — PokéVerse OS',
    canActivate: [authGuard],
    data: { moduleId: 'overworld' },
    loadComponent: () =>
      import('./features/under-construction/under-construction.component').then(
        (m) => m.UnderConstructionComponent,
      ),
  },
  {
    path: 'arcade',
    title: 'Arcade Retrô 3D — PokéVerse OS',
    canActivate: [authGuard],
    data: { moduleId: 'arcade' },
    loadComponent: () =>
      import('./features/under-construction/under-construction.component').then(
        (m) => m.UnderConstructionComponent,
      ),
  },
  {
    path: 'arena',
    title: 'Battle Frontier — PokéVerse OS',
    canActivate: [authGuard],
    data: { moduleId: 'arena' },
    loadComponent: () =>
      import('./features/under-construction/under-construction.component').then(
        (m) => m.UnderConstructionComponent,
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
