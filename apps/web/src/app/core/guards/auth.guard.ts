import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { PLATFORM_MODULES } from '@pokeverse/shared';
import { AuthStore } from '../stores/auth.store';

/** Protects trainer-only routes while letting visitors stay on public routes cleanly. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthStore);
  if (auth.isAuthenticated()) {
    return true;
  }

  const router = inject(Router);
  const matchedModule = PLATFORM_MODULES.find((mod) => mod.route === state.url);

  auth.requestTrainerAccess(
    matchedModule ? `${matchedModule.label} (Exclusivo para Treinadores)` : 'Área de Treinador',
    matchedModule?.summary ??
      'Este módulo sincroniza progresso em nuvem e partidas em tempo real. A conta de treinador será habilitada na Fase 2.',
    state.url,
  );

  return router.navigated ? false : router.createUrlTree(['/']);
};
