import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { PLATFORM_MODULES } from '@pokeverse/shared';
import { AuthStore } from '../stores/auth.store';

const SAFE_INTERNAL_ROUTE = /^\/[a-zA-Z0-9/_-]*$/;

/** Protects trainer-only routes while preventing open redirects via returnUrl. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthStore);
  if (auth.isAuthenticated()) {
    return true;
  }

  const router = inject(Router);
  const safeTarget = SAFE_INTERNAL_ROUTE.test(state.url) ? state.url : undefined;
  const matchedModule = PLATFORM_MODULES.find((mod) => mod.route === safeTarget);

  auth.requestTrainerAccess(
    matchedModule ? `${matchedModule.label} (Exclusivo para Treinadores)` : 'Área de Treinador',
    matchedModule?.summary ??
      'Este módulo sincroniza progresso em nuvem e sessões em tempo real para treinadores autenticados.',
    safeTarget,
  );

  return router.navigated ? false : router.createUrlTree(['/']);
};
