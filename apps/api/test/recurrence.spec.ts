import { describe, expect, it } from 'vitest';
import { Weekday } from '@prisma/client';

import { RecurrenceService } from '../src/scheduling/recurrence.service';

const recurrence = new RecurrenceService();
const tuesdayAtSix = {
  weekday: Weekday.TUESDAY,
  localStartTime: '18:00:00',
  timeZone: 'Europe/Prague',
};

describe('weekly schedule recurrence', () => {
  it('converts a one-off winter local time to its Prague instant', () => {
    expect(
      recurrence.localDateTimeToInstant(
        '2099-01-20',
        '18:30:00',
        'Europe/Prague',
      ),
    ).toEqual(new Date('2099-01-20T17:30:00.000Z'));
  });

  it('converts a one-off summer local time to its Prague instant', () => {
    expect(
      recurrence.localDateTimeToInstant(
        '2099-07-20',
        '18:30:00',
        'Europe/Prague',
      ),
    ).toEqual(new Date('2099-07-20T16:30:00.000Z'));
  });

  it.each([
    ['2099-03-29', '02:30:00'],
    ['2099-10-25', '02:30:00'],
  ])(
    'rejects a one-off local time that is skipped or repeated by DST (%s)',
    (localDate, localStartTime) => {
      expect(() =>
        recurrence.localDateTimeToInstant(
          localDate,
          localStartTime,
          'Europe/Prague',
        ),
      ).toThrow();
    },
  );

  it('keeps Tuesday 18:00 local during CET', () => {
    expect(
      recurrence.nextOccurrence(
        tuesdayAtSix,
        new Date('2026-01-01T00:00:00.000Z'),
      ),
    ).toEqual(new Date('2026-01-06T17:00:00.000Z'));
  });

  it('keeps Tuesday 18:00 local during CEST', () => {
    expect(
      recurrence.nextOccurrence(
        tuesdayAtSix,
        new Date('2026-07-01T00:00:00.000Z'),
      ),
    ).toEqual(new Date('2026-07-07T16:00:00.000Z'));
  });

  it('preserves local time across the spring DST boundary', () => {
    const occurrence = recurrence.nextOccurrence(
      tuesdayAtSix,
      new Date('2026-03-25T00:00:00.000Z'),
    );

    expect(occurrence).toEqual(new Date('2026-03-31T16:00:00.000Z'));
    expect(recurrence.creationOpensAt(occurrence, 'Europe/Prague', 7)).toEqual(
      new Date('2026-03-24T17:00:00.000Z'),
    );
  });

  it('keeps the adjacent spring-transition Tuesdays at the same wall-clock time', () => {
    expect(
      recurrence.nextOccurrence(
        tuesdayAtSix,
        new Date('2026-03-18T00:00:00.000Z'),
      ),
    ).toEqual(new Date('2026-03-24T17:00:00.000Z'));
    expect(
      recurrence.nextOccurrence(
        tuesdayAtSix,
        new Date('2026-03-25T00:00:00.000Z'),
      ),
    ).toEqual(new Date('2026-03-31T16:00:00.000Z'));
    expect(
      recurrence.nextOccurrence(
        tuesdayAtSix,
        new Date('2026-04-01T00:00:00.000Z'),
      ),
    ).toEqual(new Date('2026-04-07T16:00:00.000Z'));
  });

  it('preserves local time and the local seven-day horizon across autumn DST', () => {
    const beforeTransition = recurrence.nextOccurrence(
      tuesdayAtSix,
      new Date('2026-10-14T00:00:00.000Z'),
    );
    const afterTransition = recurrence.nextOccurrence(
      tuesdayAtSix,
      new Date('2026-10-21T00:00:00.000Z'),
    );

    expect(beforeTransition).toEqual(new Date('2026-10-20T16:00:00.000Z'));
    expect(afterTransition).toEqual(new Date('2026-10-27T17:00:00.000Z'));
    expect(
      recurrence.creationOpensAt(afterTransition, 'Europe/Prague', 7),
    ).toEqual(new Date('2026-10-20T16:00:00.000Z'));
  });

  it('uses Temporal compatible disambiguation for exceptional Sunday local times', () => {
    const sundayAtHalfPastTwo = {
      weekday: Weekday.SUNDAY,
      localStartTime: '02:30:00',
      timeZone: 'Europe/Prague',
    };

    expect(
      recurrence.nextOccurrence(
        sundayAtHalfPastTwo,
        new Date('2026-03-23T00:00:00.000Z'),
      ),
    ).toEqual(new Date('2026-03-29T01:30:00.000Z'));
    expect(
      recurrence.nextOccurrence(
        sundayAtHalfPastTwo,
        new Date('2026-10-19T00:00:00.000Z'),
      ),
    ).toEqual(new Date('2026-10-25T00:30:00.000Z'));
  });

  it('returns the following week after the current occurrence starts', () => {
    expect(
      recurrence.nextOccurrence(
        tuesdayAtSix,
        new Date('2026-07-07T16:00:00.000Z'),
      ),
    ).toEqual(new Date('2026-07-14T16:00:00.000Z'));
  });

  it('validates IANA time zones', () => {
    expect(recurrence.isValidTimeZone('Europe/Prague')).toBe(true);
    expect(recurrence.isValidTimeZone('Not/A_Time_Zone')).toBe(false);
  });
});
