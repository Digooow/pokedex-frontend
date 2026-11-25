import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { WorldTickerEvent } from '@pokeverse/shared';
import { HudTopbarComponent } from '../../shared/hud/hud-topbar.component';
import { flushInitialRequests } from '../../testing/test-fixtures.spec-helper';
import { TICKER_NOTIFICATION_TTL_MS, WorldTickerStore } from './world-ticker.store';

function createTickerEvent(overrides?: Partial<WorldTickerEvent>): WorldTickerEvent {
  return {
    eventId: '550e8400-e29b-41d4-a716-446655440001',
    eventType: 'pokedex.slot.saved',
    trainerId: '550e8400-e29b-41d4-a716-446655440000',
    username: 'Digooow',
    summary: 'Digooow gravou Jigglypuff (#0039) no Slot 3.',
    occurredAt: new Date().toISOString(),
    traceId: null,
    ...overrides,
  };
}

describe('WorldTickerStore', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T20:00:00.000Z'));

    await TestBed.configureTestingModule({
      imports: [HudTopbarComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows activeNotification on handleGlobalEvent and clears it after TTL while keeping history', () => {
    const store = TestBed.inject(WorldTickerStore);
    const event = createTickerEvent();

    store.handleGlobalEvent(event);

    expect(store.activeNotification()).toEqual(event);
    expect(store.events()).toEqual([event]);
    expect(store.latestEvent()).toEqual(event);

    vi.advanceTimersByTime(TICKER_NOTIFICATION_TTL_MS - 1);
    expect(store.activeNotification()).toEqual(event);

    vi.advanceTimersByTime(1);
    expect(store.activeNotification()).toBeNull();
    expect(store.events()).toEqual([event]);
    expect(store.latestEvent()).toEqual(event);
  });

  it('resets the timeout when consecutive global events arrive', () => {
    const store = TestBed.inject(WorldTickerStore);
    const first = createTickerEvent({
      eventId: '550e8400-e29b-41d4-a716-446655440001',
      summary: 'Digooow gravou Jigglypuff (#0039) no Slot 3.',
    });
    const second = createTickerEvent({
      eventId: '550e8400-e29b-41d4-a716-446655440002',
      summary: 'Digooow gravou Pikachu (#0025) no Slot 1.',
    });

    store.handleGlobalEvent(first);
    vi.advanceTimersByTime(TICKER_NOTIFICATION_TTL_MS - 1_000);

    store.handleGlobalEvent(second);
    expect(store.activeNotification()).toEqual(second);

    vi.advanceTimersByTime(TICKER_NOTIFICATION_TTL_MS - 1);
    expect(store.activeNotification()).toEqual(second);

    vi.advanceTimersByTime(1);
    expect(store.activeNotification()).toBeNull();
    expect(store.events().map((item) => item.eventId)).toEqual([second.eventId, first.eventId]);
  });

  it('skips flashing stale recent events but displays and auto-dismisses fresh recent events', () => {
    const store = TestBed.inject(WorldTickerStore);
    const staleEvent = createTickerEvent({
      eventId: '550e8400-e29b-41d4-a716-446655440003',
      occurredAt: new Date('2026-11-24T19:59:00.000Z').toISOString(),
    });

    store.handleRecentEvents([staleEvent]);
    expect(store.events()).toEqual([staleEvent]);
    expect(store.activeNotification()).toBeNull();

    const freshEvent = createTickerEvent({
      eventId: '550e8400-e29b-41d4-a716-446655440004',
      occurredAt: new Date('2026-11-24T19:59:50.000Z').toISOString(),
    });

    store.handleRecentEvents([freshEvent, staleEvent]);
    expect(store.activeNotification()).toEqual(freshEvent);

    vi.advanceTimersByTime(TICKER_NOTIFICATION_TTL_MS);
    expect(store.activeNotification()).toBeNull();
    expect(store.events()).toHaveLength(2);
  });

  it('clears activeNotification immediately on dismissNotification', () => {
    const store = TestBed.inject(WorldTickerStore);
    const event = createTickerEvent();

    store.handleGlobalEvent(event);
    expect(store.activeNotification()).toEqual(event);

    store.dismissNotification();
    expect(store.activeNotification()).toBeNull();

    vi.advanceTimersByTime(TICKER_NOTIFICATION_TTL_MS);
    expect(store.activeNotification()).toBeNull();
  });

  it('renders .hud-ticker in HudTopbarComponent and removes it after TTL elapses', () => {
    const fixture = TestBed.createComponent(HudTopbarComponent);
    fixture.detectChanges();
    flushInitialRequests(TestBed.inject(HttpTestingController));

    const store = TestBed.inject(WorldTickerStore);
    const event = createTickerEvent();

    store.handleGlobalEvent(event);
    fixture.detectChanges();

    const tickerEl = fixture.nativeElement.querySelector('.hud-ticker') as HTMLElement | null;
    expect(tickerEl).not.toBeNull();
    expect(tickerEl?.textContent).toContain('Digooow gravou Jigglypuff (#0039) no Slot 3.');

    vi.advanceTimersByTime(TICKER_NOTIFICATION_TTL_MS);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.hud-ticker')).toBeNull();
  });
});
