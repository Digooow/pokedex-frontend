import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { WorldTickerEvent } from '@pokeverse/shared';
import type { Server, Socket } from 'socket.io';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';

const MAX_RECENT_TICKER_EVENTS = 12;

@WebSocketGateway({
  namespace: '/ws/world',
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const rawAllowed =
        process.env['CORS_ORIGINS'] ??
        'http://localhost:4200,http://127.0.0.1:4200';
      const allowed = rawAllowed
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      callback(null, allowed.includes(origin));
    },
    credentials: true,
  },
})
export class WorldGateway implements OnGatewayConnection {
  @WebSocketServer()
  server?: Server;

  private readonly recentEvents: WorldTickerEvent[] = [];

  constructor(private readonly logger: StructuredLoggerService) {}

  handleConnection(client: Socket): void {
    if (this.recentEvents.length > 0) {
      client.emit('world:recent-events', this.recentEvents);
    }
  }

  broadcastGlobalEvent(event: WorldTickerEvent): void {
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > MAX_RECENT_TICKER_EVENTS) {
      this.recentEvents.length = MAX_RECENT_TICKER_EVENTS;
    }

    if (this.server) {
      this.server.emit('world:global-event', event);
    }

    this.logger.emitEvent('info', `World event broadcast: ${event.eventType}`, {
      context: WorldGateway.name,
      traceId: event.traceId,
    });
  }
}
