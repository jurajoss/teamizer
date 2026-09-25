import type { Weekday } from '../api/contracts';

export const MATCH_TIME_ZONE = 'Europe/Prague';

export const weekdays: ReadonlyArray<{ value: Weekday; label: string }> = [
  { value: 'MONDAY', label: 'Mon' },
  { value: 'TUESDAY', label: 'Tue' },
  { value: 'WEDNESDAY', label: 'Wed' },
  { value: 'THURSDAY', label: 'Thu' },
  { value: 'FRIDAY', label: 'Fri' },
  { value: 'SATURDAY', label: 'Sat' },
  { value: 'SUNDAY', label: 'Sun' },
];

export type ManualMatchDraft = {
  sportId: string;
  localDate: Date | null;
  localStartTime: Date | null;
  location: string;
};

export type ManualMatchValidation = Partial<
  Record<'sportId' | 'localDate' | 'localStartTime' | 'location', string>
>;

export type ReminderUnit = 'MINUTES' | 'HOURS' | 'DAYS';

export type ReminderDraft = {
  value: string;
  unit: ReminderUnit;
};

export type SubmissionGate = { current: boolean };

export function createDefaultManualMatchDraft(
  now = new Date(),
): ManualMatchDraft {
  const localDate = new Date(now);
  localDate.setDate(localDate.getDate() + 1);
  localDate.setHours(12, 0, 0, 0);
  return {
    sportId: '',
    localDate,
    localStartTime: new Date(1970, 0, 1, 18, 0, 0, 0),
    location: '',
  };
}

export function canAccessMatchAdministration(
  role: 'PLAYER' | 'ADMIN',
): boolean {
  return role === 'ADMIN';
}

export function validateManualMatchDraft(
  draft: ManualMatchDraft,
): ManualMatchValidation {
  const errors: ManualMatchValidation = {};
  if (!draft.sportId) errors.sportId = 'Choose a Sport.';
  if (!draft.localDate) errors.localDate = 'Choose a date.';
  if (!draft.localStartTime) {
    errors.localStartTime = 'Choose a start time.';
  }
  if (draft.location.trim().length > 255) {
    errors.location = 'Location must be 255 characters or fewer.';
  }
  return errors;
}

export function canSubmitManualMatch(
  draft: ManualMatchDraft,
  submitting: boolean,
): boolean {
  return (
    !submitting && Object.keys(validateManualMatchDraft(draft)).length === 0
  );
}

export async function runSingleSubmission<T>(
  gate: SubmissionGate,
  submit: () => Promise<T>,
): Promise<T | undefined> {
  if (gate.current) return undefined;
  gate.current = true;
  try {
    return await submit();
  } finally {
    gate.current = false;
  }
}

export function formatLocalDateForApi(value: Date): string {
  return [
    String(value.getFullYear()).padStart(4, '0'),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

export function formatLocalTimeForApi(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(
    value.getMinutes(),
  ).padStart(2, '0')}:00`;
}

export function parseLocalTime(value: string): Date | null {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return new Date(1970, 0, 1, hour, minute, second, 0);
}

export function reminderDraftFromMinutes(minutes: number): ReminderDraft {
  if (minutes > 0 && minutes % 1_440 === 0) {
    return { value: String(minutes / 1_440), unit: 'DAYS' };
  }
  if (minutes > 0 && minutes % 60 === 0) {
    return { value: String(minutes / 60), unit: 'HOURS' };
  }
  return { value: String(minutes), unit: 'MINUTES' };
}

export function reminderDraftToMinutes(draft: ReminderDraft): number | null {
  if (!/^\d+$/.test(draft.value)) return null;
  const value = Number(draft.value);
  const multiplier =
    draft.unit === 'DAYS' ? 1_440 : draft.unit === 'HOURS' ? 60 : 1;
  const minutes = value * multiplier;
  return Number.isSafeInteger(minutes) && minutes <= 2_147_483_647
    ? minutes
    : null;
}
