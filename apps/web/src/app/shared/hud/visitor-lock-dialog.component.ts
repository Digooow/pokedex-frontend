import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { AuthStore } from '../../core/stores/auth.store';

@Component({
  selector: 'pv-visitor-lock-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialogEl
      class="visitor-dialog"
      aria-labelledby="pv-visitor-title"
      closedby="any"
      (close)="onNativeClose()"
      (pointerdown)="onPointerDown($event)"
      (pointerup)="onPointerUp($event)"
    >
      @if (auth.visitorPrompt(); as prompt) {
        <div class="visitor-dialog__card">
          <div class="visitor-dialog__badge" aria-hidden="true">ACESSO DE TREINADOR</div>
          <h2 id="pv-visitor-title" class="visitor-dialog__title">{{ prompt.title }}</h2>
          <p class="visitor-dialog__desc">{{ prompt.description }}</p>

          @if (prompt.targetRoute) {
            <p class="visitor-dialog__meta">
              Rota protegida: <code>{{ prompt.targetRoute }}</code>
            </p>
          }

          <p class="visitor-dialog__note">
            No <strong>Modo Visitante</strong> você já pode explorar a <strong>Pokédex 3D</strong>
            e o <strong>Museu das Regiões</strong> livremente. Login JWT + gravação na nuvem entram
            na próxima fase.
          </p>

          <form method="dialog" class="visitor-dialog__actions">
            <button type="submit" value="continue" class="visitor-dialog__btn-primary" autofocus>
              Continuar como Visitante
            </button>
          </form>
        </div>
      }
    </dialog>
  `,
  styles: [
    `
      .visitor-dialog {
        padding: 0;
        border: 1px solid var(--pv-border-gold);
        border-radius: var(--pv-radius-lg);
        background: var(--pv-surface-solid);
        color: var(--pv-ink-primary);
        max-inline-size: min(29rem, calc(100vw - 2rem));
        box-shadow: 0 24px 60px oklch(0% 0 0 / 0.65);
      }

      .visitor-dialog:not([open]) {
        display: none;
      }

      .visitor-dialog__card {
        display: grid;
        gap: var(--pv-space-3);
        padding: var(--pv-space-5);
      }

      .visitor-dialog__badge {
        justify-self: start;
        padding: 0.25rem 0.625rem;
        border-radius: var(--pv-radius-pill);
        border: 1px solid var(--pv-border-gold);
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: var(--pv-border-gold);
      }

      .visitor-dialog__title {
        margin: 0;
        font-size: 1.25rem;
        line-height: 1.25;
      }

      .visitor-dialog__desc,
      .visitor-dialog__note,
      .visitor-dialog__meta {
        margin: 0;
        font-size: 0.9375rem;
        color: var(--pv-ink-muted);
      }

      .visitor-dialog__meta code {
        font-family: var(--pv-font-mono);
        color: var(--pv-ink-primary);
      }

      .visitor-dialog__actions {
        display: flex;
        justify-content: flex-end;
        margin-block-start: var(--pv-space-2);
      }

      .visitor-dialog__btn-primary {
        min-block-size: 2.75rem;
        padding: 0.625rem 1.25rem;
        border: 0;
        border-radius: var(--pv-radius-sm);
        background: var(--pv-dex-red);
        color: var(--pv-ink-on-accent);
        font-weight: 700;
        cursor: pointer;
      }

      .visitor-dialog__btn-primary:hover {
        background: var(--pv-dex-red-deep);
      }
    `,
  ],
})
export class VisitorLockDialogComponent {
  readonly auth = inject(AuthStore);
  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');
  private pressedOutside = false;

  constructor() {
    effect(() => {
      const prompt = this.auth.visitorPrompt();
      const dialog = this.dialogRef()?.nativeElement;
      if (!dialog) {
        return;
      }
      if (prompt && !dialog.open) {
        dialog.showModal();
      } else if (!prompt && dialog.open) {
        dialog.close();
      }
    });
  }

  onNativeClose(): void {
    const dialog = this.dialogRef()?.nativeElement;
    if (dialog) {
      dialog.returnValue = '';
    }
    this.auth.dismissVisitorPrompt();
  }

  onPointerDown(event: PointerEvent): void {
    if ('closedBy' in HTMLDialogElement.prototype) {
      return;
    }
    const dialog = this.dialogRef()?.nativeElement;
    this.pressedOutside = dialog ? this.isOutsideBoundingBox(event, dialog) : false;
  }

  onPointerUp(event: PointerEvent): void {
    if ('closedBy' in HTMLDialogElement.prototype) {
      return;
    }
    const dialog = this.dialogRef()?.nativeElement;
    if (this.pressedOutside && dialog && this.isOutsideBoundingBox(event, dialog)) {
      dialog.close();
    }
    this.pressedOutside = false;
  }

  private isOutsideBoundingBox(event: PointerEvent, dialog: HTMLDialogElement): boolean {
    const rect = dialog.getBoundingClientRect();
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  }
}
