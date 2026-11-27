import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { AuthStore } from '../../core/stores/auth.store';

@Component({
  selector: 'pv-hud-user-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hud-user-menu.component.html',
  styleUrl: './hud-user-menu.component.scss',
})
export class HudUserMenuComponent {
  readonly auth = inject(AuthStore);

  readonly open = input<boolean>(false);
  readonly toggled = output<void>();
  readonly closed = output<void>();

  openVisitorInfo(): void {
    this.closed.emit();
    this.auth.requestTrainerAccess(
      'Modo Visitante Ativo',
      'Explore a Pokédex livremente (incluindo Enciclopédia, Atlas das Regiões, Holocron 3D, Comparador 1v1 e Calculadora). Entre ou cadastre sua conta de Treinador para sincronizar os 10 slots e salvar progresso na nuvem.',
    );
  }

  openMfaChallenge(): void {
    this.closed.emit();
    this.auth.openMfaChallengePrompt();
  }

  openVerifyEmail(email: string): void {
    this.closed.emit();
    this.auth.requestTrainerAccess(
      'Confirmar E-mail do Treinador',
      `Enviamos um código OTP de 6 dígitos para ${email}.`,
      undefined,
      'verify-email',
    );
  }

  openSecuritySettings(): void {
    this.closed.emit();
    this.auth.openSecuritySettings();
  }

  logout(): void {
    this.closed.emit();
    this.auth.logout();
  }
}
