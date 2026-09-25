import { describe, expect, it, vi } from 'vitest';

import type { Schedule, UpdateScheduleInput } from '../api/contracts';
import { matchQueryKeys } from './match-query-keys';
import {
  initialScheduleDraft,
  scheduleDraftFromSchedule,
  validateScheduleDraft,
} from './schedule-form';
import {
  generateScheduledMatchAndRefresh,
  persistSchedule,
} from './use-admin-schedule-controller';

const sportId = '00000000-0000-4000-8000-000000000001';
const matchId = '00000000-0000-4000-8000-000000000002';

function schedule(): Schedule {
  return {
    id: '00000000-0000-4000-8000-000000000003',
    enabled: true,
    weekday: 'THURSDAY',
    localStartTime: '18:30:00',
    timeZone: 'Europe/Prague',
    sportId,
    location: 'Pitch A',
    generationHorizonDays: 14,
    registrationReminderMinutes: 2_880,
    finalReminderMinutes: 180,
  };
}

const messages = {
  localStartTime: 'choose time',
  timeZone: 'enter zone',
  sportId: 'choose sport',
  location: 'location length',
  generationHorizonDays: 'enter horizon',
  registrationReminder: 'invalid reminder',
  finalReminder: 'invalid reminder',
};

describe('Schedule behavior seam', () => {
  it('creates the exact editable draft from the authoritative Schedule', () => {
    const draft = scheduleDraftFromSchedule(schedule());

    expect(draft).toMatchObject({
      enabled: true,
      weekday: 'THURSDAY',
      timeZone: 'Europe/Prague',
      sportId,
      location: 'Pitch A',
      generationHorizonDays: '14',
      registrationReminder: { value: '2', unit: 'DAYS' },
      finalReminder: { value: '3', unit: 'HOURS' },
    });
    expect(draft.localStartTime?.getHours()).toBe(18);
    expect(draft.localStartTime?.getMinutes()).toBe(30);
  });

  it('keeps validation errors in draft form and emits an API input only when valid', () => {
    expect(validateScheduleDraft(initialScheduleDraft, messages)).toEqual({
      errors: {
        localStartTime: 'choose time',
        sportId: 'choose sport',
      },
      input: null,
    });

    const result = validateScheduleDraft(
      {
        ...scheduleDraftFromSchedule(schedule()),
        location: '  Pitch B  ',
      },
      messages,
    );
    expect(result.errors).toEqual({});
    expect(result.input).toEqual({
      enabled: true,
      weekday: 'THURSDAY',
      localStartTime: '18:30:00',
      timeZone: 'Europe/Prague',
      sportId,
      location: 'Pitch B',
      generationHorizonDays: 14,
      registrationReminderMinutes: 2_880,
      finalReminderMinutes: 180,
    });
  });

  it('persists the validated input without changing scheduling semantics', async () => {
    const input = validateScheduleDraft(
      scheduleDraftFromSchedule(schedule()),
      messages,
    ).input as UpdateScheduleInput;
    const updateAdminSchedule = vi.fn().mockResolvedValue(schedule());

    await expect(
      persistSchedule({ updateAdminSchedule }, input),
    ).resolves.toEqual(schedule());
    expect(updateAdminSchedule).toHaveBeenCalledWith(input);
  });

  it('refreshes Home only after generation succeeds and returns the generated Match', async () => {
    const generateScheduledMatch = vi.fn().mockResolvedValue({
      created: true,
      match: {
        id: matchId,
        sport: {
          id: sportId,
          name: 'Football',
          teamsPerMatch: 2,
          playersOnFieldPerTeam: 5,
        },
        startsAt: '2026-09-24T16:30:00.000Z',
        location: 'Pitch A',
        status: 'OPEN_FOR_REGISTRATION',
        stateVersion: 0,
      },
    });
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      generateScheduledMatchAndRefresh({ generateScheduledMatch }, queryClient),
    ).resolves.toBe(matchId);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: matchQueryKeys.upcoming,
      refetchType: 'all',
    });
  });
});
