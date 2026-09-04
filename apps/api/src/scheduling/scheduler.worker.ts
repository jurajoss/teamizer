import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ReminderService } from '../notifications/reminder.service';
import { ScheduleService } from './schedule.service';

@Injectable()
export class SchedulerWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SchedulerWorker.name);
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(ScheduleService) private readonly schedules: ScheduleService,
    @Inject(ReminderService) private readonly reminders: ReminderService,
  ) {
    this.enabled = config.get<boolean>('SCHEDULER_ENABLED') ?? true;
    this.intervalMs =
      config.get<number>('SCHEDULER_TICK_INTERVAL_MS') ?? 60_000;
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const created = await this.schedules.materializeDue(now);
      const delivered = await this.reminders.dispatchDue(now);
      this.logger.log(
        `Scheduler tick completed: ${created} Match(es) created, ${delivered} reminder(s) delivered.`,
      );
    } catch (error) {
      this.logger.error(
        'Scheduler tick failed; the next tick will retry.',
        error,
      );
    } finally {
      this.running = false;
    }
  }
}
