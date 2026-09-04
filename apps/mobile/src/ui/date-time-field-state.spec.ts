import { describe, expect, it } from 'vitest';

import {
  cancelNativePicker,
  confirmNativePicker,
  resolveNativePickerChange,
} from './date-time-field-state';

describe('native date/time picker behavior', () => {
  const selected = new Date(2030, 8, 17, 20, 45);

  it('keeps an iOS wheel selection as a visible draft until confirmed', () => {
    const changed = resolveNativePickerChange('ios', 'set', selected);
    expect(changed).toEqual({
      close: false,
      commit: null,
      draft: selected,
    });

    expect(confirmNativePicker(changed.draft!)).toEqual({
      close: true,
      commit: selected,
      draft: selected,
    });
  });

  it('cancels iOS interaction without replacing the selected value', () => {
    expect(cancelNativePicker()).toEqual({
      close: true,
      commit: null,
      draft: null,
    });
  });

  it('commits Android dialog selections and ignores dialog dismissal', () => {
    expect(resolveNativePickerChange('android', 'set', selected)).toEqual({
      close: true,
      commit: selected,
      draft: selected,
    });
    expect(
      resolveNativePickerChange('android', 'dismissed', undefined),
    ).toEqual({ close: true, commit: null, draft: null });
  });
});
