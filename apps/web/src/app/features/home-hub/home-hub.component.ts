import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PLATFORM_MODULES } from '@pokeverse/shared';
import { AuthStore } from '../../core/stores/auth.store';
import { PvMainHeadingDirective } from '../../shared/directives/main-heading.directive';
import { RequiresTrainerDirective } from '../../shared/directives/requires-trainer.directive';

@Component({
  selector: 'pv-home-hub',
  imports: [RouterLink, PvMainHeadingDirective, RequiresTrainerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-hub.component.html',
  styleUrl: './home-hub.component.scss',
})
export class HomeHubComponent {
  readonly auth = inject(AuthStore);
  readonly modules = PLATFORM_MODULES;

  requestTrainerLogin(): void {
    this.auth.requestTrainerAccess(
      'Entrar ou Criar Conta de Treinador',
      'Sincronize seus 10 slots da Pokédex na nuvem e desbloqueie os módulos exclusivos para Treinadores.',
    );
  }
}
