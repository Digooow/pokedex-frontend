import { ErrorHandler, Injectable, inject } from '@angular/core';
import { WebTelemetryService } from './web-telemetry.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly telemetry = inject(WebTelemetryService);

  handleError(error: unknown): void {
    void this.telemetry.reportUiCrash(error);
  }
}
