import type { WorldTickerEvent } from '@pokeverse/shared';
import type { Socket } from 'socket.io';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import { WorldGateway, isAllowedWebSocketOrigin } from './world.gateway';

function createSocketMock(id: string, ip: string) {
  const emit = jest.fn();
  const disconnect = jest.fn();
  const socket = {
    id,
    handshake: {
      address: ip,
      headers: {},
    },
    emit,
    disconnect,
  } as unknown as Socket;
  return { socket, emit, disconnect };
}

describe('WorldGateway (WebSocket CORS & connection quota)', () => {
  it('blocks missing Origin in production and validates CORS_ORIGINS allowlist with trailing-slash normalization', () => {
    expect(
      isAllowedWebSocketOrigin(undefined, {
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://pokeverse.pages.dev',
      }),
    ).toBe(false);

    expect(
      isAllowedWebSocketOrigin(undefined, {
        NODE_ENV: 'development',
        CORS_ORIGINS: 'http://localhost:4200',
      }),
    ).toBe(true);

    expect(
      isAllowedWebSocketOrigin('https://pokeverse.pages.dev/', {
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://pokeverse.pages.dev',
      }),
    ).toBe(true);

    expect(
      isAllowedWebSocketOrigin('https://evil.example', {
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://pokeverse.pages.dev',
      }),
    ).toBe(false);
  });

  it('delivers recent events, enforces per-IP connection quota, and frees slots on disconnect', () => {
    const logger = new StructuredLoggerService();
    const emitEventSpy = jest
      .spyOn(logger, 'emitEvent')
      .mockImplementation(() => undefined);

    const gateway = new WorldGateway(logger);
    const sampleEvent: WorldTickerEvent = {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      eventType: 'pokedex.slot.saved',
      trainerId: '550e8400-e29b-41d4-a716-446655440001',
      username: 'Red_Kanto',
      summary: 'Red_Kanto gravou Pikachu (#0025) no Slot 1.',
      occurredAt: '2026-11-22T20:00:00.000Z',
      traceId: null,
    };
    gateway.broadcastGlobalEvent(sampleEvent);

    const sockets = Array.from({ length: 10 }, (_, idx) =>
      createSocketMock(`sock-${idx}`, '203.0.113.10'),
    );
    for (const item of sockets) {
      gateway.handleConnection(item.socket);
      expect(item.disconnect).not.toHaveBeenCalled();
      expect(item.emit).toHaveBeenCalledWith('world:recent-events', [
        sampleEvent,
      ]);
    }

    const eleventh = createSocketMock('sock-11', '203.0.113.10');
    gateway.handleConnection(eleventh.socket);
    expect(eleventh.disconnect).toHaveBeenCalledWith(true);
    expect(emitEventSpy).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('203.0.113.10'),
      expect.objectContaining({ errorCode: 'WS_CONNECTION_LIMIT_HIT' }),
    );

    const firstSocket = sockets[0];
    if (!firstSocket) {
      throw new Error('Expected initial socket mock');
    }
    gateway.handleDisconnect(firstSocket.socket);
    const replacement = createSocketMock('sock-12', '203.0.113.10');
    gateway.handleConnection(replacement.socket);
    expect(replacement.disconnect).not.toHaveBeenCalled();
  });

  it('resolves client IP from the trusted rightmost proxy hop when TRUST_PROXY=1 to block X-Forwarded-For spoofing', () => {
    const previousTrustProxy = process.env['TRUST_PROXY'];
    process.env['TRUST_PROXY'] = '1';
    try {
      const logger = new StructuredLoggerService();
      jest.spyOn(logger, 'emitEvent').mockImplementation(() => undefined);
      const gateway = new WorldGateway(logger);

      for (let i = 0; i < 10; i += 1) {
        const disconnect = jest.fn();
        const spoofed = {
          id: `spoof-${i}`,
          handshake: {
            address: '10.0.0.5',
            headers: {
              'x-forwarded-for': `198.18.0.${i + 1}, 198.51.100.77`,
            },
          },
          emit: jest.fn(),
          disconnect,
        } as unknown as Socket;
        gateway.handleConnection(spoofed);
        expect(disconnect).not.toHaveBeenCalled();
      }

      const disconnectEleventh = jest.fn();
      const eleventh = {
        id: 'spoof-10',
        handshake: {
          address: '10.0.0.5',
          headers: {
            'x-forwarded-for': '203.0.113.250, 198.51.100.77',
          },
        },
        emit: jest.fn(),
        disconnect: disconnectEleventh,
      } as unknown as Socket;
      gateway.handleConnection(eleventh);
      expect(disconnectEleventh).toHaveBeenCalledWith(true);
    } finally {
      if (previousTrustProxy === undefined) {
        delete process.env['TRUST_PROXY'];
      } else {
        process.env['TRUST_PROXY'] = previousTrustProxy;
      }
    }
  });
});
