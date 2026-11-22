import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import {
  type ActiveSessionFamily,
  ActiveSessionsResponseSchema,
  type DisableTotpInput,
  GenericMessageResponseSchema,
  PasskeyChallengeObjectSchema,
  PasskeySummarySchema,
  RevokeOtherSessionsResponseSchema,
  type SecurityOverviewResponse,
  SecurityOverviewResponseSchema,
  TotpEnableResponseSchema,
  type TotpSetupResponse,
  TotpSetupResponseSchema,
  TrainerDataExportSchema,
} from '@pokeverse/shared';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { firstValueFrom } from 'rxjs';
import { extractApiErrorMessage } from '../http/api-error.util';
import { AuthStore } from './auth.store';

export type SecurityOverviewState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly data: SecurityOverviewResponse };

export type ActiveSessionsState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly sessions: readonly ActiveSessionFamily[] };

export type TotpSetupUiState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'qr-ready'; readonly data: TotpSetupResponse }
  | { readonly status: 'enabled'; readonly backupCodes: readonly string[] }
  | { readonly status: 'error'; readonly message: string };

const DEFAULT_SEC_ERROR = 'Não foi possível concluir a operação de segurança.';

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
  private readonly sessionsSignal = signal<ActiveSessionsState>({ status: 'idle' });
  private readonly totpStateSignal = signal<TotpSetupUiState>({ status: 'idle' });
  private readonly busyActionSignal = signal<string | null>(null);
  private readonly feedbackSignal = signal<{ readonly tone: 'ok' | 'error'; readonly text: string } | null>(
    null,
  );

  readonly dialogOpen = this.dialogOpenSignal.asReadonly();
  readonly overviewState = this.overviewSignal.asReadonly();
  readonly sessionsState = this.sessionsSignal.asReadonly();
  readonly totpState = this.totpStateSignal.asReadonly();
  readonly busyAction = this.busyActionSignal.asReadonly();
  readonly feedback = this.feedbackSignal.asReadonly();

  openDialog(): void {
    const pendingFeedback = this.auth.consumeSecurityFeedback();
    if (pendingFeedback !== null) this.feedbackSignal.set(pendingFeedback);
    else if (!this.dialogOpenSignal()) this.feedbackSignal.set(null);
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
      const parsed = SecurityOverviewResponseSchema.safeParse(
        await firstValueFrom(this.http.get<unknown>('/api/v1/auth/security/overview')),
      );
      this.overviewSignal.set(
        parsed.success
          ? { status: 'ready', data: parsed.data }
          : { status: 'error', message: 'Resposta de segurança inválida.' },
      );
    } catch (err) {
      this.overviewSignal.set({ status: 'error', message: extractApiErrorMessage(err, DEFAULT_SEC_ERROR) });
    }
  }

  async startTotpSetup(): Promise<void> {
    if (this.busyActionSignal()) return;
    this.busyActionSignal.set('totp-setup');
    this.totpStateSignal.set({ status: 'loading' });
    try {
      const parsed = TotpSetupResponseSchema.safeParse(
        await firstValueFrom(this.http.post<unknown>('/api/v1/auth/mfa/totp/setup', {})),
      );
      this.totpStateSignal.set(
        parsed.success
          ? { status: 'qr-ready', data: parsed.data }
          : { status: 'error', message: 'Não foi possível gerar QR Code TOTP.' },
      );
    } catch (err) {
      this.totpStateSignal.set({ status: 'error', message: extractApiErrorMessage(err, DEFAULT_SEC_ERROR) });
    } finally {
      this.busyActionSignal.set(null);
    }
  }

  async confirmTotpEnable(code: string): Promise<void> {
    await this.runBusyAction('totp-enable', async () => {
      const parsed = TotpEnableResponseSchema.safeParse(
        await firstValueFrom(this.http.post<unknown>('/api/v1/auth/mfa/totp/enable', { code })),
      );
      if (!parsed.success) {
        this.feedbackSignal.set({ tone: 'error', text: 'Resposta TOTP inesperada.' });
        return;
      }
      this.totpStateSignal.set({ status: 'enabled', backupCodes: parsed.data.backupCodes });
      this.feedbackSignal.set({ tone: 'ok', text: parsed.data.message });
      this.auth.restoreSession();
      await this.loadOverview();
    });
  }

  async disableTotp(input: DisableTotpInput): Promise<void> {
    await this.runBusyAction('totp-disable', async () => {
      const parsed = GenericMessageResponseSchema.safeParse(
        await firstValueFrom(this.http.post<unknown>('/api/v1/auth/mfa/totp/disable', input)),
      );
      this.feedbackSignal.set({
        tone: 'ok',
        text: parsed.success ? parsed.data.message : '2FA TOTP desativado.',
      });
      this.totpStateSignal.set({ status: 'idle' });
      this.auth.restoreSession();
      await this.loadOverview();
    });
  }

  async registerPasskey(label?: string): Promise<void> {
    if (this.busyActionSignal()) return;
    this.busyActionSignal.set('passkey-add');
    this.feedbackSignal.set(null);
    try {
      const rawOptions = await firstValueFrom(this.http.post<unknown>('/api/v1/auth/passkeys/register/options', {}));
      const parsedOptions = PasskeyChallengeObjectSchema.safeParse(rawOptions);
      if (!parsedOptions.success || !isPasskeyCreationOptions(parsedOptions.data)) {
        this.feedbackSignal.set({ tone: 'error', text: 'Opções WebAuthn inválidas.' });
        return;
      }
      const { startRegistration } = await import('@simplewebauthn/browser');
      const attestation = await startRegistration({ optionsJSON: parsedOptions.data });
      const saved = PasskeySummarySchema.safeParse(
        await firstValueFrom(
          this.http.post<unknown>('/api/v1/auth/passkeys/register/verify', {
            label: label?.trim() || undefined,
            response: attestation,
          }),
        ),
      );
      this.feedbackSignal.set({
        tone: 'ok',
        text: saved.success ? `Passkey "${saved.data.label}" cadastrada.` : 'Passkey cadastrada.',
      });
      await this.loadOverview();
    } catch (err) {
      const text =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Cadastro de Passkey cancelado no dispositivo.'
          : extractApiErrorMessage(err, DEFAULT_SEC_ERROR);
      this.feedbackSignal.set({ tone: 'error', text });
    } finally {
      this.busyActionSignal.set(null);
    }
  }

  async removePasskey(id: string): Promise<void> {
    await this.runBusyAction(`passkey-del-${id}`, async () => {
      await firstValueFrom(this.http.delete(`/api/v1/auth/passkeys/${encodeURIComponent(id)}`));
      this.feedbackSignal.set({ tone: 'ok', text: 'Passkey removida.' });
      await this.loadOverview();
    });
  }

  linkGoogle(): void {
    globalThis.location.assign('/api/v1/auth/google/start');
  }

  async unlinkGoogle(): Promise<void> {
    await this.runBusyAction('google-unlink', async () => {
      await firstValueFrom(this.http.delete('/api/v1/auth/google'));
      this.feedbackSignal.set({ tone: 'ok', text: 'Conta Google desvinculada.' });
      await this.loadOverview();
    });
  }

  async loadSessions(): Promise<void> {
    this.sessionsSignal.set({ status: 'loading' });
    try {
      const parsed = ActiveSessionsResponseSchema.safeParse(
        await firstValueFrom(this.http.get<unknown>('/api/v1/auth/sessions')),
      );
      this.sessionsSignal.set(
        parsed.success
          ? { status: 'ready', sessions: parsed.data.sessions }
          : { status: 'error', message: 'Resposta de sessões inválida.' },
      );
    } catch (err) {
      this.sessionsSignal.set({ status: 'error', message: extractApiErrorMessage(err, DEFAULT_SEC_ERROR) });
    }
  }

  async revokeOtherSessions(): Promise<void> {
    await this.runBusyAction('sessions-revoke-others', async () => {
      const parsed = RevokeOtherSessionsResponseSchema.safeParse(
        await firstValueFrom(this.http.post<unknown>('/api/v1/auth/sessions/revoke-others', {})),
      );
      this.feedbackSignal.set({
        tone: 'ok',
        text: parsed.success ? parsed.data.message : 'Outras sessões encerradas.',
      });
      await this.loadSessions();
    });
  }

  async exportTrainerData(): Promise<void> {
    await this.runBusyAction('lgpd-export', async () => {
      const parsed = TrainerDataExportSchema.safeParse(
        await firstValueFrom(this.http.get<unknown>('/api/v1/auth/me/export')),
      );
      if (!parsed.success) {
        this.feedbackSignal.set({ tone: 'error', text: 'Não foi possível validar o arquivo de exportação.' });
        return;
      }
      if (typeof document !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const blob = new Blob([JSON.stringify(parsed.data, null, 2)], { type: 'application/json;charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = `pokeverse-dados-${parsed.data.trainer.username.toLowerCase()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
      }
      this.feedbackSignal.set({
        tone: 'ok',
        text: 'Arquivo JSON com seus dados exportado com sucesso (LGPD).',
      });
    });
  }

  async deleteAccount(): Promise<void> {
    await this.runBusyAction('lgpd-delete', async () => {
      await firstValueFrom(this.http.delete<unknown>('/api/v1/auth/me'));
      this.closeDialog();
      this.auth.logout();
    });
  }

  private async runBusyAction(actionKey: string, work: () => Promise<void>): Promise<void> {
    if (this.busyActionSignal()) return;
    this.busyActionSignal.set(actionKey);
    this.feedbackSignal.set(null);
    try {
      await work();
    } catch (err) {
      this.feedbackSignal.set({ tone: 'error', text: extractApiErrorMessage(err, DEFAULT_SEC_ERROR) });
    } finally {
      this.busyActionSignal.set(null);
    }
  }
}
