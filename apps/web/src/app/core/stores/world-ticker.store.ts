import { isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { type WorldTickerEvent, WorldTickerEventListSchema, WorldTickerEventSchema } from '@pokeverse/shared';
import type { Socket } from 'socket.io-client';

const MAX_TICKER_HISTORY = 12;

@Injectable({ providedIn: 'root' })
export class WorldTickerStore implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private socket: Socket | null = null;
  private connecting = false;
  private destroyed = false;

  private readonly eventsSignal = signal<readonly WorldTickerEvent[]>([]);
  private readonly connectedSignal = signal(false);

  readonly events = this.eventsSignal.asReadonly();
  readonly connected = this.connectedSignal.asReadonly();
  readonly latestEvent = computed<WorldTickerEvent | null>(() => this.eventsSignal()[0] ?? null);

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
        const parsed = WorldTickerEventListSchema.safeParse(raw);
        if (parsed.success) {
          this.eventsSignal.set(parsed.data.slice(0, MAX_TICKER_HISTORY));
        }
      });

      socket.on('world:global-event', (raw: unknown) => {
        const parsed = WorldTickerEventSchema.safeParse(raw);
        if (!parsed.success) {
          return;
        }
        this.eventsSignal.update((prev) => {
          const deduped = prev.filter((item) => item.eventId !== parsed.data.eventId);
          return [parsed.data, ...deduped].slice(0, MAX_TICKER_HISTORY);
        });
      });

      this.socket = socket;
    } finally {
      this.connecting = false;
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.socket?.disconnect();
    this.socket = null;
  }
}
