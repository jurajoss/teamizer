import { describe, expect, it } from 'vitest';

import {
  defaultDateTimeFieldValue,
  parseDateTimeInput,
  serializeDateTimeInput,
} from './date-time-field-values';

describe('date/time field values', () => {
  it('round-trips arbitrary web date and time choices as wall-clock values', () => {
    const date = parseDateTimeInput('2031-11-23', 'date');
    const time = parseDateTimeInput('07:45', 'time');

    expect(date).not.toBeNull();
    expect(time).not.toBeNull();
    expect(serializeDateTimeInput(date!, 'date')).toBe('2031-11-23');
    expect(serializeDateTimeInput(time!, 'time')).toBe('07:45');
  });

  it('rejects invalid web fallback calendar and clock values', () => {
    expect(parseDateTimeInput('2031-02-29', 'date')).toBeNull();
    expect(parseDateTimeInput('24:00', 'time')).toBeNull();
    expect(parseDateTimeInput('not-a-date', 'date')).toBeNull();
  });

  it('uses sensible local defaults without calculating a UTC offset', () => {
    const minimum = new Date(2032, 4, 6, 9, 27);
    const date = defaultDateTimeFieldValue('date', minimum);
    const time = defaultDateTimeFieldValue('time');

    expect(date.getFullYear()).toBe(2032);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(6);
    expect(date.getHours()).toBe(12);
    expect(time.getHours()).toBe(18);
    expect(time.getMinutes()).toBe(0);
  });
});
