const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_OPEN_COOLDOWN_MS = 30_000;

interface HostBreakerState {
  consecutiveFailures: number;
  openUntil: number;
}

export class UpstreamCircuitBreaker {
  private readonly states = new Map<string, HostBreakerState>();

  constructor(
    private readonly failureThreshold = DEFAULT_FAILURE_THRESHOLD,
    private readonly openCooldownMs = DEFAULT_OPEN_COOLDOWN_MS,
  ) {}

  isOpen(host: string): boolean {
    const state = this.states.get(host.toLowerCase());
    if (!state) {
      return false;
    }
    return Date.now() < state.openUntil;
  }

  recordSuccess(host: string): void {
    const key = host.toLowerCase();
    const state = this.states.get(key);
    if (!state) {
      return;
    }
    state.consecutiveFailures = 0;
    state.openUntil = 0;
  }

  recordFailure(host: string): boolean {
    const key = host.toLowerCase();
    const state = this.states.get(key) ?? {
      consecutiveFailures: 0,
      openUntil: 0,
    };
    state.consecutiveFailures += 1;
    let justOpened = false;
    if (state.consecutiveFailures >= this.failureThreshold) {
      justOpened = state.openUntil <= Date.now();
      state.openUntil = Date.now() + this.openCooldownMs;
    }
    this.states.set(key, state);
    return justOpened;
  }
}
