export const ERROR_REPORTER_PORT = Symbol('ERROR_REPORTER_PORT');

export interface CaptureExceptionInput {
  readonly source: 'api' | 'web';
  readonly exception: unknown;
  readonly errorCode: string;
  readonly route: string;
  readonly method?: string;
  readonly traceId?: string | null;
  readonly spanId?: string | null;
  readonly tags?: Readonly<Record<string, string>>;
}

export interface ErrorReporterPort {
  isEnabled(): boolean;
  captureException(input: CaptureExceptionInput): Promise<boolean>;
}
