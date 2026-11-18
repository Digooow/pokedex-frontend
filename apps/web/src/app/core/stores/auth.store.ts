import { Injectable, computed, signal } from '@angular/core';
import type { AccessMode } from '@pokeverse/shared';

export interface VisitorPromptContext {
  readonly title: string;
  readonly description: string;
  readonly targetRoute?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly accessTokenSignal = signal<string | null>(null);
  private readonly visitorPromptSignal = signal<VisitorPromptContext | null>(null);

  readonly isAuthenticated = computed(() => this.accessTokenSignal() !== null);
  readonly accessMode = computed<AccessMode>(() =>
    this.isAuthenticated() ? 'trainer' : 'visitor',
  );
  readonly visitorPrompt = this.visitorPromptSignal.asReadonly();

  requestTrainerAccess(title: string, description: string, targetRoute?: string): void {
    this.visitorPromptSignal.set({ title, description, targetRoute });
  }

  dismissVisitorPrompt(): void {
    this.visitorPromptSignal.set(null);
  }
}
