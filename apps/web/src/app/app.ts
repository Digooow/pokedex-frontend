import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ApiCreditsStore } from './core/stores/api-credits.store';
import { AuthStore } from './core/stores/auth.store';
import { PrivacyConsentStore } from './core/stores/privacy-consent.store';
import { SystemStatusStore } from './core/stores/system-status.store';
import { WorldTickerStore } from './core/stores/world-ticker.store';
import { PvMainLandmarkDirective } from './shared/directives/main-heading.directive';
import { ApiCreditsDialogComponent } from './shared/hud/api-credits-dialog.component';
import { CenariosBackdropComponent } from './shared/hud/cenarios-backdrop.component';
import { HudTopbarComponent } from './shared/hud/hud-topbar.component';
import { PrivacyConsentDialogComponent } from './shared/hud/privacy-consent-dialog.component';
import { PrivacyNoticeBannerComponent } from './shared/hud/privacy-notice-banner.component';
import { SecuritySettingsDialogComponent } from './shared/hud/security-settings-dialog.component';
import { VisitorLockDialogComponent } from './shared/hud/visitor-lock-dialog.component';

@Component({
  selector: 'pv-root',
  imports: [
    RouterOutlet,
    ApiCreditsDialogComponent,
    CenariosBackdropComponent,
    HudTopbarComponent,
    PrivacyNoticeBannerComponent,
    PrivacyConsentDialogComponent,
    VisitorLockDialogComponent,
    SecuritySettingsDialogComponent,
    PvMainLandmarkDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  readonly apiCredits = inject(ApiCreditsStore);
  readonly auth = inject(AuthStore);
  readonly privacy = inject(PrivacyConsentStore);
  private readonly router = inject(Router);
  private readonly systemStatus = inject(SystemStatusStore);
  private readonly ticker = inject(WorldTickerStore);

  private readonly currentUrl = signal(this.router.url);
  readonly isTitleScreen = computed(() => {
    const cleanUrl = this.currentUrl().split('?')[0] ?? '/';
    return cleanUrl === '' || cleanUrl === '/';
  });

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
      });
  }

  ngOnInit(): void {
    this.systemStatus.refresh();
    this.auth.restoreSession();
    this.ticker.connect();
  }
}
