import { isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import {
  type WorldTickerEvent,
  WorldTickerEventListSchema,
  WorldTickerEventSchema,
} from '@pokeverse/shared';
import type { Socket } from 'socket.io-client';

const MAX_TICKER_HISTORY = 12;
export const TICKER_NOTIFICATION_TTL_MS = 6_000;
export const TICKER_EXIT_ANIMATION_MS = 280;
const RECENT_EVENT_MAX_AGE_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class WorldTickerStore implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private socket: Socket | null = null;
  private connecting = false;
  private destroyed = false;
  private exitTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly eventsSignal = signal<readonly WorldTickerEvent[]>([]);
  private readonly activeNotificationSignal = signal<WorldTickerEvent | null>(null);
  private readonly notificationExitingSignal = signal(false);
  private readonly connectedSignal = signal(false);

  readonly events = this.eventsSignal.asReadonly();
  readonly connected = this.connectedSignal.asReadonly();
  readonly latestEvent = computed<WorldTickerEvent | null>(() => this.eventsSignal()[0] ?? null);
  readonly activeNotification = this.activeNotificationSignal.asReadonly();
  readonly notificationExiting = this.notificationExitingSignal.asReadonly();

  connect(): void {
    if (!this.isBrowser || this.socket || this.connecting || this.destroyed) {
      return;
    }

    void this.openConnection();
  }

  private async openConnection(): Promise<void> {
    this.connecting = true;
    try {
      const { io } = await import('socket.io-client');
      if (this.destroyed || this.socket) {
        return;
      }

      const socket = io('/ws/world', {
        withCredentials: true,
        transports: ['websocket', 'polling'],
      });

      socket.on('connect', () => {
        this.connectedSignal.set(true);
      });

      socket.on('disconnect', () => {
        this.connectedSignal.set(false);
      });

      socket.on('world:recent-events', (raw: unknown) => {
        this.handleRecentEvents(raw);
      });

      socket.on('world:global-event', (raw: unknown) => {
        this.handleGlobalEvent(raw);
      });

      this.socket = socket;
    } finally {
      this.connecting = false;
    }
  }

  handleRecentEvents(raw: unknown): void {
    const parsed = WorldTickerEventListSchema.safeParse(raw);
    if (!parsed.success) {
      return;
    }

    const history = parsed.data.slice(0, MAX_TICKER_HISTORY);
    this.eventsSignal.set(history);

    const newest = history[0];
    if (newest && this.isFreshEvent(newest)) {
      this.showTemporaryNotification(newest);
    }
  }

  handleGlobalEvent(raw: unknown): void {
    const parsed = WorldTickerEventSchema.safeParse(raw);
    if (!parsed.success) {
      return;
    }

    this.eventsSignal.update((prev) => {
      const deduped = prev.filter((item) => item.eventId !== parsed.data.eventId);
      return [parsed.data, ...deduped].slice(0, MAX_TICKER_HISTORY);
    });
    this.showTemporaryNotification(parsed.data);
  }

  dismissNotification(): void {
    this.clearHideTimer();
    this.notificationExitingSignal.set(false);
    this.activeNotificationSignal.set(null);
  }

  private isFreshEvent(event: WorldTickerEvent): boolean {
    const occurredAtMs = Date.parse(event.occurredAt);
    if (Number.isNaN(occurredAtMs)) {
      return false;
    }
    return Date.now() - occurredAtMs <= RECENT_EVENT_MAX_AGE_MS;
  }

  private showTemporaryNotification(event: WorldTickerEvent): void {
    this.clearHideTimer();
    this.notificationExitingSignal.set(false);
    this.activeNotificationSignal.set(event);

    if (!this.isBrowser || this.destroyed) {
      return;
    }

    const exitDelay = Math.max(0, TICKER_NOTIFICATION_TTL_MS - TICKER_EXIT_ANIMATION_MS);
    this.exitTimer = setTimeout(() => {
      this.exitTimer = null;
      this.notificationExitingSignal.set(true);
    }, exitDelay);

    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.notificationExitingSignal.set(false);
      this.activeNotificationSignal.set(null);
    }, TICKER_NOTIFICATION_TTL_MS);
  }

  private clearHideTimer(): void {
    if (this.exitTimer !== null) {
      clearTimeout(this.exitTimer);
      this.exitTimer = null;
    }
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearHideTimer();
    this.socket?.disconnect();
    this.socket = null;
  }
}
