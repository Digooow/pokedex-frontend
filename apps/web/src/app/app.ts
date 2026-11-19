import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from './core/stores/auth.store';
import { SystemStatusStore } from './core/stores/system-status.store';
import { WorldTickerStore } from './core/stores/world-ticker.store';
import { CenariosBackdropComponent } from './shared/hud/cenarios-backdrop.component';
import { CenariosBarComponent } from './shared/hud/cenarios-bar.component';
import { HudQuickDockComponent } from './shared/hud/hud-quick-dock.component';
import { HudTopbarComponent } from './shared/hud/hud-topbar.component';
import { SecuritySettingsDialogComponent } from './shared/hud/security-settings-dialog.component';
import { VisitorLockDialogComponent } from './shared/hud/visitor-lock-dialog.component';

@Component({
  selector: 'pv-root',
  imports: [
    RouterOutlet,
    CenariosBackdropComponent,
    CenariosBarComponent,
    HudTopbarComponent,
    HudQuickDockComponent,
    VisitorLockDialogComponent,
    SecuritySettingsDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  readonly auth = inject(AuthStore);
  private readonly systemStatus = inject(SystemStatusStore);
  private readonly ticker = inject(WorldTickerStore);

  ngOnInit(): void {
    this.systemStatus.refresh();
    this.auth.restoreSession();
    this.ticker.connect();
  }
}
