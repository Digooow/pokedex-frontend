import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import {
  type DisableTotpInput,
  GenericMessageResponseSchema,
  PasskeyChallengeObjectSchema,
  PasskeySummarySchema,
  type SecurityOverviewResponse,
  SecurityOverviewResponseSchema,
  TotpEnableResponseSchema,
  type TotpSetupResponse,
  TotpSetupResponseSchema,
} from '@pokeverse/shared';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from './auth.store';

export type SecurityOverviewState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly data: SecurityOverviewResponse };

export type TotpSetupUiState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'qr-ready'; readonly data: TotpSetupResponse }
  | { readonly status: 'enabled'; readonly backupCodes: readonly string[] }
  | { readonly status: 'error'; readonly message: string };

function isPasskeyCreationOptions(value: unknown): value is PublicKeyCredentialCreationOptionsJSON {
  return (
    typeof value === 'object' &&
    value !== null &&
    'challenge' in value &&
    'rp' in value &&
    'user' in value &&
    'pubKeyCredParams' in value
  );
}

@Injectable({ providedIn: 'root' })
export class SecurityIamStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthStore);

  private readonly dialogOpenSignal = signal(false);
  private readonly overviewSignal = signal<SecurityOverviewState>({ status: 'idle' });
  private readonly totpStateSignal = signal<TotpSetupUiState>({ status: 'idle' });
  private readonly busyActionSignal = signal<string | null>(null);
  private readonly feedbackSignal = signal<{ readonly tone: 'ok' | 'error'; readonly text: string } | null>(
    null,
  );

  readonly dialogOpen = this.dialogOpenSignal.asReadonly();
  readonly overviewState = this.overviewSignal.asReadonly();
  readonly totpState = this.totpStateSignal.asReadonly();
  readonly busyAction = this.busyActionSignal.asReadonly();
  readonly feedback = this.feedbackSignal.asReadonly();

  openDialog(): void {
    this.feedbackSignal.set(null);
    this.totpStateSignal.set({ status: 'idle' });
    this.dialogOpenSignal.set(true);
    this.auth.openSecuritySettings();
    void this.loadOverview();
  }

  closeDialog(): void {
    this.dialogOpenSignal.set(false);
    this.totpStateSignal.set({ status: 'idle' });
    this.feedbackSignal.set(null);
    this.auth.closeSecuritySettings();
  }

  async loadOverview(): Promise<void> {
    this.overviewSignal.set({ status: 'loading' });
    try {
      const raw = await firstValueFrom(this.http.get<unknown>('/api/v1/auth/security/overview'));
      const parsed = SecurityOverviewResponseSchema.safeParse(raw);
      if (!parsed.success) {
        this.overviewSignal.set({ status: 'error', message: 'Resposta de segurança inválida.' });
        return;
      }
      this.overviewSignal.set({ status: 'ready', data: parsed.data });
    } catch (err) {
      this.overviewSignal.set({ status: 'error', message: this.extractError(err) });
    }
  }

  async startTotpSetup(): Promise<void> {
    if (this.busyActionSignal()) {
      return;
    }
    this.busyActionSignal.set('totp-setup');
    this.totpStateSignal.set({ status: 'loading' });
    try {
      const raw = await firstValueFrom(this.http.post<unknown>('/api/v1/auth/mfa/totp/setup', {}));
      const parsed = TotpSetupResponseSchema.safeParse(raw);
      if (!parsed.success) {
        this.totpStateSignal.set({ status: 'error', message: 'Não foi possível gerar QR Code TOTP.' });
        return;
      }
      this.totpStateSignal.set({ status: 'qr-ready', data: parsed.data });
    } catch (err) {
      this.totpStateSignal.set({ status: 'error', message: this.extractError(err) });
    } finally {
      this.busyActionSignal.set(null);
    }
  }

  async confirmTotpEnable(code: string): Promise<void> {
    if (this.busyActionSignal()) {
      return;
    }
    this.busyActionSignal.set('totp-enable');
    this.feedbackSignal.set(null);
    try {
      const raw = await firstValueFrom(
        this.http.post<unknown>('/api/v1/auth/mfa/totp/enable', { code }),
      );
      const parsed = TotpEnableResponseSchema.safeParse(raw);
      if (!parsed.success) {
        this.feedbackSignal.set({ tone: 'error', text: 'Resposta TOTP inesperada.' });
        return;
      }
      this.totpStateSignal.set({ status: 'enabled', backupCodes: parsed.data.backupCodes });
      this.feedbackSignal.set({ tone: 'ok', text: parsed.data.message });
      this.auth.restoreSession();
      await this.loadOverview();
    } catch (err) {
      this.feedbackSignal.set({ tone: 'error', text: this.extractError(err) });
    } finally {
      this.busyActionSignal.set(null);
    }
  }

  async disableTotp(input: DisableTotpInput): Promise<void> {
    if (this.busyActionSignal()) {
      return;
    }
    this.busyActionSignal.set('totp-disable');
    this.feedbackSignal.set(null);
    try {
      const raw = await firstValueFrom(this.http.post<unknown>('/api/v1/auth/mfa/totp/disable', input));
      const parsed = GenericMessageResponseSchema.safeParse(raw);
      this.feedbackSignal.set({
        tone: 'ok',
        text: parsed.success ? parsed.data.message : '2FA TOTP desativado.',
      });
      this.totpStateSignal.set({ status: 'idle' });
      this.auth.restoreSession();
      await this.loadOverview();
    } catch (err) {
      this.feedbackSignal.set({ tone: 'error', text: this.extractError(err) });
    } finally {
      this.busyActionSignal.set(null);
    }
  }

  async registerPasskey(label?: string): Promise<void> {
    if (this.busyActionSignal()) {
      return;
    }
    this.busyActionSignal.set('passkey-add');
    this.feedbackSignal.set(null);
    try {
      const rawOptions = await firstValueFrom(
        this.http.post<unknown>('/api/v1/auth/passkeys/register/options', {}),
      );
      const parsedOptions = PasskeyChallengeObjectSchema.safeParse(rawOptions);
      if (!parsedOptions.success || !isPasskeyCreationOptions(parsedOptions.data)) {
        this.feedbackSignal.set({ tone: 'error', text: 'Opções WebAuthn inválidas.' });
        return;
      }

      const { startRegistration } = await import('@simplewebauthn/browser');
      const attestation = await startRegistration({ optionsJSON: parsedOptions.data });

      const rawSaved = await firstValueFrom(
        this.http.post<unknown>('/api/v1/auth/passkeys/register/verify', {
          label: label?.trim() || undefined,
          response: attestation,
        }),
      );
      const saved = PasskeySummarySchema.safeParse(rawSaved);
      this.feedbackSignal.set({
        tone: 'ok',
        text: saved.success ? `Passkey "${saved.data.label}" cadastrada.` : 'Passkey cadastrada.',
      });
      await this.loadOverview();
    } catch (err) {
      const text =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Cadastro de Passkey cancelado no dispositivo.'
          : this.extractError(err);
      this.feedbackSignal.set({ tone: 'error', text });
    } finally {
      this.busyActionSignal.set(null);
    }
  }

  async removePasskey(id: string): Promise<void> {
    if (this.busyActionSignal()) {
      return;
    }
    this.busyActionSignal.set(`passkey-del-${id}`);
    this.feedbackSignal.set(null);
    try {
      await firstValueFrom(this.http.delete(`/api/v1/auth/passkeys/${encodeURIComponent(id)}`));
      this.feedbackSignal.set({ tone: 'ok', text: 'Passkey removida.' });
      await this.loadOverview();
    } catch (err) {
      this.feedbackSignal.set({ tone: 'error', text: this.extractError(err) });
    } finally {
      this.busyActionSignal.set(null);
    }
  }

  linkGoogle(): void {
    globalThis.location.assign('/api/v1/auth/google/start');
  }

  async unlinkGoogle(): Promise<void> {
    if (this.busyActionSignal()) {
      return;
    }
    this.busyActionSignal.set('google-unlink');
    this.feedbackSignal.set(null);
    try {
      await firstValueFrom(this.http.delete('/api/v1/auth/google'));
      this.feedbackSignal.set({ tone: 'ok', text: 'Conta Google desvinculada.' });
      await this.loadOverview();
    } catch (err) {
      this.feedbackSignal.set({ tone: 'error', text: this.extractError(err) });
    } finally {
      this.busyActionSignal.set(null);
    }
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { message?: unknown } | null;
      if (body && typeof body.message === 'string' && body.message.trim()) {
        return body.message;
      }
    }
    return 'Não foi possível concluir a operação de segurança.';
  }
}
