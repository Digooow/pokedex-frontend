export type AppError = {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly statusCode?: number;
};

export type AsyncState<T, E = AppError> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'empty'; readonly reason: string }
  | { readonly status: 'error'; readonly error: E }
  | { readonly status: 'success'; readonly data: T };

export type HardwareTier = 'ultra' | 'balanced' | 'lite';
export type PerfPreference = 'auto' | HardwareTier;
export type AccessMode = 'visitor' | 'trainer';

/** Ensures exhaustive switch branches at compile time. */
export function assertNever(value: never, context = 'Unexpected variant'): never {
  throw new Error(`${context}: ${String(value)}`);
}
