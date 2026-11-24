import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { createTraceparentHeader } from '../telemetry/trace-context.util';
import { WebTelemetryService } from '../telemetry/web-telemetry.service';

export const telemetryTraceInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/') && !req.url.startsWith('/health/')) {
    return next(req);
  }

  if (req.headers.has('traceparent')) {
    return next(req);
  }

  const telemetry = inject(WebTelemetryService);
  const trace = createTraceparentHeader();
  telemetry.setLastTraceId(trace.traceId);

  return next(
    req.clone({
      setHeaders: {
        traceparent: trace.traceparent,
      },
    }),
  );
};
