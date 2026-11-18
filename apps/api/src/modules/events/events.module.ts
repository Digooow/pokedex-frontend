import { Module } from '@nestjs/common';
import { WorldModule } from '../world/world.module';
import { OutboxRelayService } from './outbox-relay.service';
import { WorldEventsConsumerService } from './world-events.consumer';

@Module({
  imports: [WorldModule],
  providers: [OutboxRelayService, WorldEventsConsumerService],
})
export class EventsModule {}
