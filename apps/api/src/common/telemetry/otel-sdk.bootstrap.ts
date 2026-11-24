import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import {
  defaultResource,
  resourceFromAttributes,
} from '@opentelemetry/resources';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';

export interface OtelSdkBootstrapHandle {
  readonly active: boolean;
  readonly logsActive: boolean;
  shutdown(): Promise<void>;
}

function stripTrailingSlashes(raw: string): string {
  const trimmed = raw.trim();
  let end = trimmed.length;
  while (end > 0 && trimmed[end - 1] === '/') {
    end -= 1;
  }
  return trimmed.slice(0, end);
}

export function startOtelNodeSdk(params: {
  readonly enabled: boolean;
  readonly isTestEnv: boolean;
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: string;
  readonly otlpEndpoint: string;
}): OtelSdkBootstrapHandle {
  if (!params.enabled || params.isTestEnv) {
    return {
      active: false,
      logsActive: false,
      shutdown: () => Promise.resolve(),
    };
  }

  const endpointBase = stripTrailingSlashes(params.otlpEndpoint);
  const traceExporter = endpointBase
    ? new OTLPTraceExporter({ url: `${endpointBase}/v1/traces` })
    : undefined;
  const metricReader = endpointBase
    ? new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${endpointBase}/v1/metrics`,
        }),
        exportIntervalMillis: 15_000,
      })
    : undefined;
  const logProcessor = endpointBase
    ? new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: `${endpointBase}/v1/logs`,
        }),
      })
    : undefined;

  const resource = defaultResource().merge(
    resourceFromAttributes({
      'service.name': params.serviceName,
      'service.version': params.serviceVersion,
      'deployment.environment.name': params.environment,
    }),
  );

  const sdk = new NodeSDK({
    resource,
    instrumentations: [new HttpInstrumentation()],
    ...(traceExporter ? { traceExporter } : {}),
    ...(metricReader ? { metricReaders: [metricReader] } : {}),
    ...(logProcessor ? { logRecordProcessors: [logProcessor] } : {}),
  });

  sdk.start();
  return {
    active: true,
    logsActive: Boolean(logProcessor),
    shutdown: () => sdk.shutdown(),
  };
}
