import { HttpErrorResponse } from '@angular/common/http';

export function extractApiErrorMessage(err: unknown, fallbackMessage: string): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { message?: unknown } | null;
    if (body && typeof body.message === 'string' && body.message.trim()) {
      return body.message;
    }
    if (err.status === 0) {
      return 'API indisponível no momento. Verifique se o servidor NestJS está rodando.';
    }
  }
  return fallbackMessage;
}
