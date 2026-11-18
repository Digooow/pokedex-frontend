import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthStore } from '../stores/auth.store';

const AUTH_SKIP_REFRESH_PATHS = ['/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/refresh'];

/** Attaches credentials & Bearer JWT to API requests and refreshes silently on 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) {
    return next(req);
  }

  const auth = inject(AuthStore);
  const token = auth.accessToken();
  const isRefreshExcluded = AUTH_SKIP_REFRESH_PATHS.some((path) => req.url.startsWith(path));

  const authorizedReq = req.clone({
    withCredentials: true,
    ...(token && !isRefreshExcluded
      ? { setHeaders: { Authorization: `Bearer ${token}` } }
      : {}),
  });

  return next(authorizedReq).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        isRefreshExcluded
      ) {
        return throwError(() => error);
      }

      return auth.refreshAccessToken().pipe(
        switchMap((freshToken) => {
          if (!freshToken) {
            return throwError(() => error);
          }
          const retryReq = req.clone({
            withCredentials: true,
            setHeaders: { Authorization: `Bearer ${freshToken}` },
          });
          return next(retryReq);
        }),
      );
    }),
  );
};
