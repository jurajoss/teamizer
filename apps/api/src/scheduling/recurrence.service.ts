import { Injectable } from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import type { Weekday } from '@prisma/client';

const ISO_WEEKDAY: Record<Weekday, number> = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 7,
};

export type RecurrenceConfiguration = {
  weekday: Weekday;
  localStartTime: string;
  timeZone: string;
};

@Injectable()
export class RecurrenceService {
  localDateTimeToInstant(
    localDate: string,
    localStartTime: string,
    timeZone: string,
  ): Date {
    const date = Temporal.PlainDate.from(localDate);
    const time = Temporal.PlainTime.from(localStartTime);
    const dateTime = date.toPlainDateTime(time);
    const zonedDateTime = dateTime.toZonedDateTime(timeZone, {
      disambiguation: 'reject',
    });

    return new Date(zonedDateTime.epochMilliseconds);
  }

  nextOccurrence(schedule: RecurrenceConfiguration, after: Date): Date {
    const time = Temporal.PlainTime.from(schedule.localStartTime);
    const now = Temporal.Instant.fromEpochMilliseconds(after.getTime());
    const zonedNow = now.toZonedDateTimeISO(schedule.timeZone);
    const weekdayDelta =
      (ISO_WEEKDAY[schedule.weekday] - zonedNow.dayOfWeek + 7) % 7;
    let date = zonedNow.toPlainDate().add({ days: weekdayDelta });
    let occurrence = date
      .toPlainDateTime(time)
      .toZonedDateTime(schedule.timeZone, { disambiguation: 'compatible' });

    if (Temporal.Instant.compare(occurrence.toInstant(), now) <= 0) {
      date = date.add({ days: 7 });
      occurrence = date
        .toPlainDateTime(time)
        .toZonedDateTime(schedule.timeZone, { disambiguation: 'compatible' });
    }

    return new Date(occurrence.epochMilliseconds);
  }

  creationOpensAt(
    occurrence: Date,
    timeZone: string,
    horizonDays: number,
  ): Date {
    const zoned = Temporal.Instant.fromEpochMilliseconds(
      occurrence.getTime(),
    ).toZonedDateTimeISO(timeZone);
    return new Date(zoned.subtract({ days: horizonDays }).epochMilliseconds);
  }

  isValidTimeZone(timeZone: string): boolean {
    try {
      Temporal.Now.instant().toZonedDateTimeISO(timeZone);
      return true;
    } catch {
      return false;
    }
  }
}
