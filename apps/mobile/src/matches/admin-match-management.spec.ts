import { describe, expect, it, vi } from 'vitest';

import {
  canAccessMatchAdministration,
  canSubmitManualMatch,
  createDefaultManualMatchDraft,
  formatLocalDateForApi,
  formatLocalTimeForApi,
  parseLocalTime,
  reminderDraftFromMinutes,
  reminderDraftToMinutes,
  runSingleSubmission,
  validateManualMatchDraft,
  weekdays,
  type ManualMatchDraft,
} from './admin-match-management';

const validDraft: ManualMatchDraft = {
  sportId: '00000000-0000-4000-8000-000000000001',
  localDate: new Date(2099, 6, 20, 12),
  localStartTime: new Date(1970, 0, 1, 18, 30),
  location: 'Pitch A',
};

describe('ADMIN Match management', () => {
  it('keeps navigation ADMIN-only', () => {
    expect(canAccessMatchAdministration('ADMIN')).toBe(true);
    expect(canAccessMatchAdministration('PLAYER')).toBe(false);
  });

  it('validates the required one-off Match selections and location length', () => {
    expect(validateManualMatchDraft(validDraft)).toEqual({});
    expect(
      validateManualMatchDraft({
        sportId: '',
        localDate: null,
        localStartTime: null,
        location: 'x'.repeat(256),
      }),
    ).toEqual({
      sportId: 'Choose a Sport.',
      localDate: 'Choose a date.',
      localStartTime: 'Choose a start time.',
      location: 'Location must be 255 characters or fewer.',
    });
    expect(canSubmitManualMatch(validDraft, false)).toBe(true);
    expect(canSubmitManualMatch(validDraft, true)).toBe(false);
  });

  it('starts one-off creation with a visible future date and 18:00 time', () => {
    const draft = createDefaultManualMatchDraft(new Date(2030, 2, 14, 21, 30));
    expect(formatLocalDateForApi(draft.localDate!)).toBe('2030-03-15');
    expect(formatLocalTimeForApi(draft.localStartTime!)).toBe('18:00:00');
  });

  it('serializes calendar components without applying a UTC offset', () => {
    expect(formatLocalDateForApi(validDraft.localDate!)).toBe('2099-07-20');
    expect(formatLocalTimeForApi(validDraft.localStartTime!)).toBe('18:30:00');
    expect(parseLocalTime('18:30:00')?.getHours()).toBe(18);
    expect(parseLocalTime('25:00:00')).toBeNull();

    const changedDate = new Date(2033, 10, 23, 12);
    const changedTime = new Date(1970, 0, 1, 7, 45);
    expect(formatLocalDateForApi(changedDate)).toBe('2033-11-23');
    expect(formatLocalTimeForApi(changedTime)).toBe('07:45:00');
  });

  it('prevents concurrent double submission and releases after failure', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const submit = vi.fn(async () => blocked);
    const gate = { current: false };

    const first = runSingleSubmission(gate, submit);
    const second = await runSingleSubmission(gate, submit);
    expect(second).toBeUndefined();
    expect(submit).toHaveBeenCalledTimes(1);
    release();
    await first;

    await expect(
      runSingleSubmission(gate, async () => {
        throw new Error('server rejected');
      }),
    ).rejects.toThrow('server rejected');
    expect(gate.current).toBe(false);
  });

  it('presents weekdays and reminders in human units without losing API minutes', () => {
    expect(weekdays.map(({ label }) => label)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
    expect(reminderDraftFromMinutes(2_880)).toEqual({
      value: '2',
      unit: 'DAYS',
    });
    expect(reminderDraftFromMinutes(180)).toEqual({
      value: '3',
      unit: 'HOURS',
    });
    expect(reminderDraftToMinutes({ value: '90', unit: 'MINUTES' })).toBe(90);
    expect(reminderDraftToMinutes({ value: '-1', unit: 'HOURS' })).toBeNull();
  });
});
