import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PrivacyConsentStore } from '../../core/stores/privacy-consent.store';

@Component({
  selector: 'pv-privacy-notice-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="privacy-banner" aria-label="Aviso de Cookies e Privacidade">
      <p class="privacy-banner__text">
        <strong>Cookies &amp; LGPD:</strong>
        usamos cookies estritamente necessários de sessão segura (HttpOnly) e armazenamento local
        para suas preferências. Nenhum rastreador de terceiros está ativo.
      </p>
      <div class="privacy-banner__actions">
        <button type="button" class="privacy-banner__btn" (click)="privacy.acceptEssentialOnly()">
          Apenas essenciais
        </button>
        <button type="button" class="privacy-banner__btn" (click)="privacy.openDialog()">
          Configurar
        </button>
        <button
          type="button"
          class="privacy-banner__btn privacy-banner__btn--primary"
          (click)="privacy.acceptAll()"
        >
          Aceitar tudo
        </button>
      </div>
    </aside>
  `,
  styles: [
    `
      .privacy-banner {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--pv-space-3);
        inline-size: min(76rem, calc(100vw - 1.5rem));
        margin: 0 auto var(--pv-space-2);
        padding: var(--pv-space-3) var(--pv-space-4);
        border-radius: var(--pv-radius-md);
        border: 1px solid var(--pv-border-strong);
        background: var(--pv-surface-solid);
        color: var(--pv-ink-primary);
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.42);
      }

      .privacy-banner__text {
        flex: 1 1 20rem;
        margin: 0;
        min-inline-size: 0;
        font-size: 0.8125rem;
        line-height: 1.45;
        color: var(--pv-ink-muted);
      }

      .privacy-banner__text strong {
        color: var(--pv-ink-primary);
      }

      .privacy-banner__actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--pv-space-2);
      }

      .privacy-banner__btn {
        min-block-size: 2.5rem;
        padding: 0.4rem 0.85rem;
        border-radius: var(--pv-radius-sm);
        border: 1px solid var(--pv-border-strong);
        background: var(--palette-slate-900);
        color: var(--pv-ink-primary);
        font-size: 0.78rem;
        font-weight: 700;
        cursor: pointer;
        transition:
          border-color 150ms ease,
          background-color 150ms ease;
      }

      .privacy-banner__btn:hover {
        border-color: var(--palette-cyan-300);
        background: var(--palette-slate-800);
      }

      .privacy-banner__btn--primary {
        border-color: var(--pv-dex-red);
        background: var(--pv-dex-red);
        color: var(--pv-ink-on-accent);
      }

      .privacy-banner__btn--primary:hover {
        border-color: var(--pv-border-gold);
        background: var(--pv-dex-red-deep);
      }
    `,
  ],
})
export class PrivacyNoticeBannerComponent {
  readonly privacy = inject(PrivacyConsentStore);
}
