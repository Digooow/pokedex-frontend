import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import {
  type AsyncState,
  type ReadinessResponse,
  ReadinessResponseSchema,
  type SystemBootstrap,
  SystemBootstrapSchema,
} from '@pokeverse/shared';
import { Subscription, catchError, forkJoin, of } from 'rxjs';

export interface SystemStatusSnapshot {
  readonly readiness: ReadinessResponse;
  readonly bootstrap: SystemBootstrap | null;
}

@Injectable({ providedIn: 'root' })
export class SystemStatusStore implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly stateSignal = signal<AsyncState<SystemStatusSnapshot>>({ status: 'idle' });
  private activeSub: Subscription | null = null;

  readonly state = this.stateSignal.asReadonly();

  refresh(): void {
    this.activeSub?.unsubscribe();
    this.stateSignal.set({ status: 'loading' });

    const ready$ = this.http.get<unknown>('/health/ready').pipe(
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse) {
          const degraded = ReadinessResponseSchema.safeParse(err.error);
          if (degraded.success) {
            return of(degraded.data);
          }
        }
        return of(null);
      }),
    );

    const boot$ = this.http
      .get<unknown>('/api/v1/system/bootstrap')
      .pipe(catchError(() => of(null)));

    this.activeSub = forkJoin({ ready: ready$, boot: boot$ }).subscribe(({ ready, boot }) => {
      const parsedReady = ReadinessResponseSchema.safeParse(ready);
      if (!parsedReady.success) {
        this.stateSignal.set({
          status: 'error',
          error: {
            code: 'API_UNREACHABLE',
            message:
              'Back-end NestJS offline no momento; modos públicos seguem operando normalmente.',
            retryable: true,
          },
        });
        return;
      }

      const parsedBoot = SystemBootstrapSchema.safeParse(boot);
      this.stateSignal.set({
        status: 'success',
        data: {
          readiness: parsedReady.data,
          bootstrap: parsedBoot.success ? parsedBoot.data : null,
        },
      });
    });
  }

  ngOnDestroy(): void {
    this.activeSub?.unsubscribe();
  }
}
