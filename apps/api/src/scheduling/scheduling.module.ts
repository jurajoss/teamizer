import { Module } from '@nestjs/common';

import { PushDeviceController } from '../notifications/push-device.controller';
import { PushDeviceService } from '../notifications/push-device.service';
import {
  FirebaseExpoPushNotificationGateway,
  PUSH_NOTIFICATION_GATEWAY,
} from '../notifications/push-notification.gateway';
import { ReminderService } from '../notifications/reminder.service';
import { RecurrenceService } from './recurrence.service';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { SchedulerWorker } from './scheduler.worker';

@Module({
  controllers: [ScheduleController, PushDeviceController],
  providers: [
    RecurrenceService,
    ScheduleService,
    PushDeviceService,
    ReminderService,
    SchedulerWorker,
    {
      provide: PUSH_NOTIFICATION_GATEWAY,
      useClass: FirebaseExpoPushNotificationGateway,
    },
  ],
  exports: [RecurrenceService, ScheduleService, ReminderService],
})
export class SchedulingModule {}
