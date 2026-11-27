import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthStore } from '../../core/stores/auth.store';
import { PvMainHeadingDirective } from '../../shared/directives/main-heading.directive';
import { RequiresTrainerDirective } from '../../shared/directives/requires-trainer.directive';
import {
  UNDER_CONSTRUCTION_MODULES,
  UNDER_CONSTRUCTION_TABS,
  type UnderConstructionModuleConfig,
  type UnderConstructionModuleId,
} from './under-construction.data';

function resolveModuleId(raw: unknown): UnderConstructionModuleId {
  if (raw === 'overworld' || raw === 'arcade' || raw === 'arena') {
    return raw;
  }
  return 'overworld';
}

@Component({
  selector: 'pv-under-construction',
  imports: [RouterLink, RequiresTrainerDirective, PvMainHeadingDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './under-construction.component.html',
  styleUrl: './under-construction.component.scss',
})
export class UnderConstructionComponent {
  readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);

  private readonly routeData = toSignal(this.route.data, {
    initialValue: this.route.snapshot.data,
  });

  readonly tabs = UNDER_CONSTRUCTION_TABS;
  readonly useFallbackArtwork = signal(false);
  readonly imageFailed = signal(false);

  readonly module = computed<UnderConstructionModuleConfig>(
    () => UNDER_CONSTRUCTION_MODULES[resolveModuleId(this.routeData()['moduleId'])],
  );

  readonly activePokemonSrc = computed(() =>
    this.useFallbackArtwork() ? this.module().pokemonFallbackUrl : this.module().pokemonArtworkUrl,
  );

  constructor() {
    effect(() => {
      this.module();
      this.useFallbackArtwork.set(false);
      this.imageFailed.set(false);
    });
  }

  onArtworkError(): void {
    if (!this.useFallbackArtwork()) {
      this.useFallbackArtwork.set(true);
      return;
    }
    this.imageFailed.set(true);
  }
}
