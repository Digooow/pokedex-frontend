import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiCreditsStore } from '../../core/stores/api-credits.store';
import { AuthStore } from '../../core/stores/auth.store';
import { PrivacyConsentStore } from '../../core/stores/privacy-consent.store';
import { SystemStatusStore } from '../../core/stores/system-status.store';
import { WorldTickerStore } from '../../core/stores/world-ticker.store';
import { MainLandmarkFocusService } from '../directives/main-heading.directive';

@Component({
  selector: 'pv-hud-topbar',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hud-topbar.component.html',
  styleUrl: './hud-topbar.component.scss',
})
export class HudTopbarComponent {
  readonly apiCredits = inject(ApiCreditsStore);
  readonly auth = inject(AuthStore);
  readonly privacy = inject(PrivacyConsentStore);
  readonly systemStatus = inject(SystemStatusStore);
  readonly ticker = inject(WorldTickerStore);
  private readonly mainLandmark = inject(MainLandmarkFocusService);

  readonly statusBadge = computed(() => {
    const state = this.systemStatus.state();
    switch (state.status) {
      case 'loading':
        return { label: 'Nuvem: Checando...', tone: 'neutral', title: 'Consultando /health/ready' };
      case 'success': {
        const ready = state.data.readiness;
        const ok = ready.status === 'ok';
        return {
          label: ok ? 'Nuvem Online' : 'Nuvem Degradada',
          tone: ok ? 'ok' : 'warn',
          title: `DB: ${ready.dependencies.postgres.status} (${ready.dependencies.postgres.latencyMs}ms) · Redis: ${ready.dependencies.redis.status} · Kafka: ${ready.dependencies.kafka.status}`,
        };
      }
      case 'error':
        return { label: 'Modo Offline', tone: 'warn', title: state.error.message };
      default:
        return { label: 'Nuvem...', tone: 'neutral', title: 'Status inicial' };
    }
  });

  openVisitorInfo(): void {
    this.auth.requestTrainerAccess(
      'Modo Visitante Ativo',
      'Explore Pokédex e Museu livremente. Entre ou cadastre sua conta de Treinador para sincronizar os 10 slots e salvar progresso na nuvem.',
    );
  }

  openVerifyEmail(email: string): void {
    this.auth.requestTrainerAccess(
      'Confirmar E-mail do Treinador',
      `Enviamos um código OTP de 6 dígitos para ${email}.`,
      undefined,
      'verify-email',
    );
  }

  jumpToMainContent(event: Event): void {
    event.preventDefault();
    this.mainLandmark.focusMainHeading();
  }
}
