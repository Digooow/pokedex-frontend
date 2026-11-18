import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthStore } from '../stores/auth.store';

const AUTH_SKIP_REFRESH_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/session',
  '/api/v1/auth/logout',
];

/** Sends HttpOnly session cookies strictly to first-party API calls and refreshes once on 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) {
    return next(req);
  }

  const auth = inject(AuthStore);
  const isRefreshExcluded = AUTH_SKIP_REFRESH_PATHS.some((path) => req.url.startsWith(path));

  const cookieReq = req.clone({
    withCredentials: true,
  });

  return next(cookieReq).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || isRefreshExcluded) {
        return throwError(() => error);
      }

      return auth.refreshSession().pipe(
        switchMap((refreshed) => {
          if (!refreshed) {
            return throwError(() => error);
          }
          return next(req.clone({ withCredentials: true }));
        }),
      );
    }),
  );
};
