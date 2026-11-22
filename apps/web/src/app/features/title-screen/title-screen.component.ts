import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/stores/auth.store';
import { QualityStore } from '../../core/stores/quality.store';
import { SystemStatusStore } from '../../core/stores/system-status.store';
import { PvMainHeadingDirective } from '../../shared/directives/main-heading.directive';

interface InfraDependencyCard {
  readonly name: string;
  readonly status: 'up' | 'down';
  readonly latencyMs: number;
}

@Component({
  selector: 'pv-title-screen',
  imports: [RouterLink, PvMainHeadingDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './title-screen.component.html',
  styleUrl: './title-screen.component.scss',
})
export class TitleScreenComponent {
  readonly quality = inject(QualityStore);
  readonly systemStatus = inject(SystemStatusStore);
  readonly auth = inject(AuthStore);

  readonly dependencyCards = computed<readonly InfraDependencyCard[] | null>(() => {
    const state = this.systemStatus.state();
    if (state.status !== 'success') {
      return null;
    }
    const deps = state.data.readiness.dependencies;
    return [
      { name: 'PostgreSQL', status: deps.postgres.status, latencyMs: deps.postgres.latencyMs },
      { name: 'Redis', status: deps.redis.status, latencyMs: deps.redis.latencyMs },
      { name: 'Redpanda/Kafka', status: deps.kafka.status, latencyMs: deps.kafka.latencyMs },
      { name: 'MinIO/S3', status: deps.s3.status, latencyMs: deps.s3.latencyMs },
    ];
  });

  requestTrainerLogin(): void {
    this.auth.requestTrainerAccess(
      'Entrar ou Criar Conta de Treinador',
      'Autentique-se via Argon2id + JWT para gravar seus 10 slots da Pokédex no PostgreSQL e acompanhar eventos ao vivo via Kafka + WebSocket.',
    );
  }
}
