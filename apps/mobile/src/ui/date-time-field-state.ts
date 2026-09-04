export type NativePickerPlatform = 'ios' | 'android';

export type NativePickerChange = {
  close: boolean;
  commit: Date | null;
  draft: Date | null;
};

export function resolveNativePickerChange(
  platform: NativePickerPlatform,
  eventType: 'set' | 'dismissed' | 'neutralButtonPressed',
  selected: Date | undefined,
): NativePickerChange {
  if (eventType !== 'set' || !selected) {
    return { close: true, commit: null, draft: null };
  }
  return platform === 'ios'
    ? { close: false, commit: null, draft: selected }
    : { close: true, commit: selected, draft: selected };
}

export function confirmNativePicker(draft: Date): NativePickerChange {
  return { close: true, commit: draft, draft };
}

export function cancelNativePicker(): NativePickerChange {
  return { close: true, commit: null, draft: null };
}
