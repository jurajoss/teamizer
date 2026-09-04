export type DateTimeFieldMode = 'date' | 'time';

export function defaultDateTimeFieldValue(
  mode: DateTimeFieldMode,
  minimumDate?: Date,
): Date {
  if (mode === 'date') {
    const value = minimumDate ? new Date(minimumDate) : new Date();
    value.setHours(12, 0, 0, 0);
    return value;
  }
  return new Date(1970, 0, 1, 18, 0, 0, 0);
}

export function displayDateTimeFieldValue(
  value: Date,
  mode: DateTimeFieldMode,
): string {
  return new Intl.DateTimeFormat(undefined, {
    ...(mode === 'date'
      ? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
      : { hour: '2-digit', minute: '2-digit' }),
  }).format(value);
}

export function serializeDateTimeInput(
  value: Date,
  mode: DateTimeFieldMode,
): string {
  if (mode === 'time') {
    return `${String(value.getHours()).padStart(2, '0')}:${String(
      value.getMinutes(),
    ).padStart(2, '0')}`;
  }
  return [
    String(value.getFullYear()).padStart(4, '0'),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

export function parseDateTimeInput(
  value: string,
  mode: DateTimeFieldMode,
): Date | null {
  if (mode === 'date') {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!parts) return null;
    const parsed = new Date(
      Number(parts[1]),
      Number(parts[2]) - 1,
      Number(parts[3]),
      12,
    );
    return serializeDateTimeInput(parsed, 'date') === value ? parsed : null;
  }
  const parts = /^(\d{2}):(\d{2})$/.exec(value);
  if (!parts) return null;
  const hour = Number(parts[1]);
  const minute = Number(parts[2]);
  return hour <= 23 && minute <= 59 ? new Date(1970, 0, 1, hour, minute) : null;
}
