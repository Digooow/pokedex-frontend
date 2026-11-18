import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SystemStatusStore } from './core/stores/system-status.store';
import { HudQuickDockComponent } from './shared/hud/hud-quick-dock.component';
import { HudTopbarComponent } from './shared/hud/hud-topbar.component';
import { VisitorLockDialogComponent } from './shared/hud/visitor-lock-dialog.component';

@Component({
  selector: 'pv-root',
  imports: [RouterOutlet, HudTopbarComponent, HudQuickDockComponent, VisitorLockDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly systemStatus = inject(SystemStatusStore);

  ngOnInit(): void {
    this.systemStatus.refresh();
  }
}
