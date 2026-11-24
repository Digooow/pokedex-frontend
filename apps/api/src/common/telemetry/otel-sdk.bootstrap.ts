import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

export interface OtelSdkBootstrapHandle {
  readonly active: boolean;
  shutdown(): Promise<void>;
}

export function startOtelNodeSdk(params: {
  readonly enabled: boolean;
  readonly isTestEnv: boolean;
  readonly serviceName: string;
  readonly otlpEndpoint: string;
}): OtelSdkBootstrapHandle {
  if (!params.enabled || params.isTestEnv) {
    return { active: false, shutdown: () => Promise.resolve() };
  }

  const endpointBase = params.otlpEndpoint.trim().replace(/\/+$/, '');
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

  const sdk = new NodeSDK({
    serviceName: params.serviceName,
    instrumentations: [new HttpInstrumentation()],
    ...(traceExporter ? { traceExporter } : {}),
    ...(metricReader ? { metricReader } : {}),
  });

  sdk.start();
  return {
    active: true,
    shutdown: () => sdk.shutdown(),
  };
}
