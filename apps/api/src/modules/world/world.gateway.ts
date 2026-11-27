import { Inject, Optional } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { WorldTickerEvent } from '@pokeverse/shared';
import type { Server, Socket } from 'socket.io';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import {
  TELEMETRY_METRICS_PORT,
  type TelemetryMetricsPort,
} from '../../common/telemetry/telemetry.port';

const MAX_RECENT_TICKER_EVENTS = 12;
const MAX_CONNECTIONS_PER_IP = 10;
const MAX_TOTAL_CONNECTIONS = 1000;

function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim();
  let end = trimmed.length;
  while (end > 0 && trimmed[end - 1] === '/') {
    end -= 1;
  }
  return trimmed.slice(0, end);
}

export function isAllowedWebSocketOrigin(
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!origin) {
    return env['NODE_ENV'] !== 'production';
  }

  const rawAllowed =
    env['CORS_ORIGINS'] ?? 'http://localhost:4200,http://127.0.0.1:4200';
  const allowed = rawAllowed
    .split(',')
    .map((entry) => normalizeOrigin(entry))
    .filter(Boolean);

  return allowed.includes(normalizeOrigin(origin));
}

@WebSocketGateway({
  namespace: '/ws/world',
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, isAllowedWebSocketOrigin(origin));
    },
    credentials: true,
  },
})
export class WorldGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server?: Server;

  private readonly recentEvents: WorldTickerEvent[] = [];
  private readonly activeConnectionsByIp = new Map<string, number>();
  private readonly socketIpMap = new Map<string, string>();
  private totalConnections = 0;

  constructor(
    private readonly logger: StructuredLoggerService,
    @Optional()
    @Inject(TELEMETRY_METRICS_PORT)
    private readonly telemetry?: TelemetryMetricsPort,
  ) {}

  handleConnection(client: Socket): void {
    const ip = this.resolveClientIp(client);
    const ipCount = this.activeConnectionsByIp.get(ip) ?? 0;

    if (
      this.totalConnections >= MAX_TOTAL_CONNECTIONS ||
      ipCount >= MAX_CONNECTIONS_PER_IP
    ) {
      this.logger.emitEvent(
        'warn',
        `WebSocket connection limit reached for ${ip}`,
        {
          context: WorldGateway.name,
          errorCode: 'WS_CONNECTION_LIMIT_HIT',
        },
      );
      client.disconnect(true);
      return;
    }

    this.socketIpMap.set(client.id, ip);
    this.activeConnectionsByIp.set(ip, ipCount + 1);
    this.totalConnections += 1;
    this.telemetry?.recordWsConnectionDelta(1);

    if (this.recentEvents.length > 0) {
      client.emit('world:recent-events', this.recentEvents);
    }
  }

  handleDisconnect(client: Socket): void {
    const ip = this.socketIpMap.get(client.id);
    if (!ip) {
      return;
    }
    this.socketIpMap.delete(client.id);
    this.totalConnections = Math.max(0, this.totalConnections - 1);
    this.telemetry?.recordWsConnectionDelta(-1);

    const nextCount = (this.activeConnectionsByIp.get(ip) ?? 0) - 1;
    if (nextCount <= 0) {
      this.activeConnectionsByIp.delete(ip);
      return;
    }
    this.activeConnectionsByIp.set(ip, nextCount);
  }

  broadcastGlobalEvent(event: WorldTickerEvent): void {
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > MAX_RECENT_TICKER_EVENTS) {
      this.recentEvents.length = MAX_RECENT_TICKER_EVENTS;
    }

    if (this.server) {
      this.server.emit('world:global-event', event);
    }

    this.telemetry?.recordWsBroadcast(event.eventType, event.traceId ?? null);
    this.logger.emitEvent('info', `World event broadcast: ${event.eventType}`, {
      context: WorldGateway.name,
      traceId: event.traceId,
    });
  }

  private resolveClientIp(client: Socket): string {
    const trustProxy = Number(process.env['TRUST_PROXY'] ?? '0');
    if (trustProxy > 0) {
      const forwarded = client.handshake.headers['x-forwarded-for'];
      const rawForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      const hops =
        rawForwarded
          ?.split(',')
          .map((ip) => ip.trim())
          .filter(Boolean) ?? [];
      if (hops.length > 0) {
        const trustedIndex = Math.max(0, hops.length - trustProxy);
        return hops[trustedIndex] ?? client.handshake.address ?? 'unknown';
      }
    }
    return client.handshake.address || 'unknown';
  }
}
