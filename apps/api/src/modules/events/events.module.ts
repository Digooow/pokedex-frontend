import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorldModule } from '../world/world.module';
import { EmailNotificationsConsumerService } from './email-notifications.consumer';
import { OutboxRelayService } from './outbox-relay.service';
import { WorldEventsConsumerService } from './world-events.consumer';

@Module({
  imports: [WorldModule, NotificationsModule],
  providers: [
    OutboxRelayService,
    WorldEventsConsumerService,
    EmailNotificationsConsumerService,
  ],
})
export class EventsModule {}
