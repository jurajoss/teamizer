import type { Schedule, UpdateScheduleInput, Weekday } from '../api/contracts';
import {
  formatLocalTimeForApi,
  MATCH_TIME_ZONE,
  parseLocalTime,
  reminderDraftFromMinutes,
  reminderDraftToMinutes,
  type ReminderDraft,
} from './admin-match-management';

export type ScheduleDraft = {
  enabled: boolean;
  weekday: Weekday;
  localStartTime: Date | null;
  timeZone: string;
  sportId: string;
  location: string;
  generationHorizonDays: string;
  registrationReminder: ReminderDraft;
  finalReminder: ReminderDraft;
};

export type ScheduleValidation = Partial<
  Record<
    | 'localStartTime'
    | 'timeZone'
    | 'sportId'
    | 'location'
    | 'generationHorizonDays'
    | 'registrationReminder'
    | 'finalReminder',
    string
  >
>;

export const initialScheduleDraft: ScheduleDraft = {
  enabled: true,
  weekday: 'TUESDAY',
  localStartTime: null,
  timeZone: MATCH_TIME_ZONE,
  sportId: '',
  location: '',
  generationHorizonDays: '7',
  registrationReminder: { value: '2', unit: 'DAYS' },
  finalReminder: { value: '3', unit: 'HOURS' },
};

export function scheduleDraftFromSchedule(schedule: Schedule): ScheduleDraft {
  return {
    enabled: schedule.enabled,
    weekday: schedule.weekday,
    localStartTime: parseLocalTime(schedule.localStartTime),
    timeZone: schedule.timeZone,
    sportId: schedule.sportId,
    location: schedule.location ?? '',
    generationHorizonDays: String(schedule.generationHorizonDays),
    registrationReminder: reminderDraftFromMinutes(
      schedule.registrationReminderMinutes,
    ),
    finalReminder: reminderDraftFromMinutes(schedule.finalReminderMinutes),
  };
}

export function validateScheduleDraft(
  draft: ScheduleDraft,
  messages: ScheduleValidation,
): {
  errors: ScheduleValidation;
  input: UpdateScheduleInput | null;
} {
  const errors: ScheduleValidation = {};
  if (!draft.localStartTime) {
    errors.localStartTime = messages.localStartTime ?? '';
  }
  if (!draft.timeZone.trim()) errors.timeZone = messages.timeZone ?? '';
  if (!draft.sportId) errors.sportId = messages.sportId ?? '';
  if (draft.location.trim().length > 255) {
    errors.location = messages.location ?? '';
  }
  const horizon = Number(draft.generationHorizonDays);
  if (!/^\d+$/.test(draft.generationHorizonDays) || horizon < 1) {
    errors.generationHorizonDays = messages.generationHorizonDays ?? '';
  }
  const registrationReminderMinutes = reminderDraftToMinutes(
    draft.registrationReminder,
  );
  if (registrationReminderMinutes === null) {
    errors.registrationReminder = messages.registrationReminder ?? '';
  }
  const finalReminderMinutes = reminderDraftToMinutes(draft.finalReminder);
  if (finalReminderMinutes === null) {
    errors.finalReminder = messages.finalReminder ?? '';
  }

  if (
    Object.keys(errors).length > 0 ||
    !draft.localStartTime ||
    registrationReminderMinutes === null ||
    finalReminderMinutes === null
  ) {
    return { errors, input: null };
  }

  return {
    errors,
    input: {
      weekday: draft.weekday,
      localStartTime: formatLocalTimeForApi(draft.localStartTime),
      timeZone: draft.timeZone.trim(),
      enabled: draft.enabled,
      sportId: draft.sportId,
      location: draft.location.trim() || null,
      generationHorizonDays: horizon,
      registrationReminderMinutes,
      finalReminderMinutes,
    },
  };
}
