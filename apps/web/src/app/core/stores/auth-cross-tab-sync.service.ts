import { isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { type AuthSessionResponse, AuthSessionResponseSchema } from '@pokeverse/shared';
import { Observable, finalize, shareReplay } from 'rxjs';

const AUTH_SYNC_CHANNEL_NAME = 'pokeverse_auth_sync';
const AUTH_REFRESH_LOCK_NAME = 'pokeverse-auth-refresh';

export type AuthSyncBroadcastMessage =
  | { readonly type: 'session'; readonly session: AuthSessionResponse }
  | { readonly type: 'logout' };

export interface OAuthCallbackParams {
  readonly googleLinked: boolean;
  readonly authError: string | null;
}

export interface SecurityFeedbackBanner {
  readonly tone: 'ok' | 'error';
  readonly text: string;
}

@Injectable({ providedIn: 'root' })
export class AuthCrossTabSyncService implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private syncChannel: BroadcastChannel | null = null;
  private listener: ((message: AuthSyncBroadcastMessage) => void) | null = null;
  private inflightRefresh$: Observable<boolean> | null = null;

  connect(onMessage: (message: AuthSyncBroadcastMessage) => void): void {
    this.listener = onMessage;
    if (this.syncChannel || !this.isBrowser || typeof BroadcastChannel !== 'function') {
      return;
    }
    try {
      const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL_NAME);
      channel.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (typeof event.data !== 'object' || event.data === null) {
          return;
        }
        const msg = event.data as Partial<AuthSyncBroadcastMessage>;
        if (msg.type === 'logout') {
          this.listener?.({ type: 'logout' });
          return;
        }
        if (msg.type === 'session') {
          const parsed = AuthSessionResponseSchema.safeParse(msg.session);
          if (parsed.success) {
            this.listener?.({ type: 'session', session: parsed.data });
          }
        }
      });
      this.syncChannel = channel;
    } catch {
      this.syncChannel = null;
    }
  }

  broadcast(message: AuthSyncBroadcastMessage): void {
    try {
      this.syncChannel?.postMessage(message);
    } catch {
      return;
    }
  }

  createSingleflightRefresh(execute: () => Promise<boolean>): Observable<boolean> {
    if (this.inflightRefresh$) {
      return this.inflightRefresh$;
    }

    this.inflightRefresh$ = new Observable<boolean>((subscriber) => {
      this.runWithRefreshLock(execute)
        .then((ok) => {
          subscriber.next(ok);
          subscriber.complete();
        })
        .catch(() => {
          subscriber.next(false);
          subscriber.complete();
        });
    }).pipe(
      finalize(() => {
        this.inflightRefresh$ = null;
      }),
      shareReplay(1),
    );
    return this.inflightRefresh$;
  }

  runWithRefreshLock<T>(work: () => Promise<T>): Promise<T> {
    if (
      this.isBrowser &&
      typeof navigator !== 'undefined' &&
      navigator.locks &&
      typeof navigator.locks.request === 'function'
    ) {
      return navigator.locks.request(AUTH_REFRESH_LOCK_NAME, work);
    }
    return work();
  }

  consumeOAuthCallbackParams(): OAuthCallbackParams {
    const loc = globalThis.location;
    if (!loc?.search) {
      return { googleLinked: false, authError: null };
    }

    const params = new URLSearchParams(loc.search);
    const googleLinked = params.get('googleLinked') === '1';
    const rawAuthError = params.get('authError')?.trim() || null;
    const hasOAuthParams =
      params.has('googleLinked') || params.has('authError') || params.has('mfaPending');

    if (hasOAuthParams) {
      params.delete('googleLinked');
      params.delete('authError');
      params.delete('mfaPending');
      const nextSearch = params.toString();
      const searchPart = nextSearch ? `?${nextSearch}` : '';
      const cleanUrl = `${loc.pathname || '/'}${searchPart}${loc.hash ?? ''}`;
      globalThis.history?.replaceState(null, '', cleanUrl);
    }

    return {
      googleLinked,
      authError: rawAuthError,
    };
  }

  resolveAuthenticatedOAuthFeedback(oauthReturn: OAuthCallbackParams): SecurityFeedbackBanner | null {
    if (oauthReturn.googleLinked) {
      return { tone: 'ok', text: 'Conta Google vinculada com sucesso via OAuth 2.0 PKCE.' };
    }
    if (oauthReturn.authError) {
      return { tone: 'error', text: this.mapOAuthErrorCode(oauthReturn.authError) };
    }
    return null;
  }

  mapOAuthErrorCode(code: string): string {
    switch (code) {
      case 'google_cancelled':
        return 'Autenticação com Google foi cancelada.';
      case 'oauth_state_invalid':
        return 'Sessão OAuth expirada ou inválida. Tente novamente.';
      case 'google_already_linked':
        return 'Esta conta Google já está vinculada a outro Treinador.';
      case 'verify_email_before_google_link':
        return 'Verifique o e-mail da sua conta antes de vincular o Google.';
      default:
        return 'Não foi possível autenticar com o Google. Tente novamente.';
    }
  }

  ngOnDestroy(): void {
    this.syncChannel?.close();
    this.syncChannel = null;
  }
}
