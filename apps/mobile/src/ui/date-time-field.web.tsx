import type { ChangeEvent, CSSProperties } from 'react';
import { createElement } from 'react';
import { View } from 'react-native';

import { AppText, colors, radii, spacing, typography } from '@teamizer/ui';

import {
  parseDateTimeInput,
  serializeDateTimeInput,
} from './date-time-field-values';

type DateTimeFieldProps = {
  label: string;
  mode: 'date' | 'time';
  value: Date | null;
  onChange(value: Date): void;
  error?: string | null;
  hint?: string;
  minimumDate?: Date;
};

export function DateTimeField({
  label,
  mode,
  value,
  onChange,
  error,
  hint,
  minimumDate,
}: DateTimeFieldProps) {
  const inputValue = value ? serializeDateTimeInput(value, mode) : '';
  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const parsed = parseDateTimeInput(event.currentTarget.value, mode);
    if (parsed) onChange(parsed);
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      {createElement('input', {
        'aria-label': label,
        min:
          mode === 'date' && minimumDate
            ? serializeDateTimeInput(minimumDate, 'date')
            : undefined,
        onChange: onInputChange,
        step: mode === 'time' ? 60 : undefined,
        style: inputStyle,
        type: mode,
        value: inputValue,
      })}
      {(error ?? hint) ? (
        <AppText variant="caption" tone={error ? 'error' : 'muted'}>
          {error ?? hint}
        </AppText>
      ) : null}
    </View>
  );
}

const inputStyle: CSSProperties = {
  backgroundColor: colors.surface,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radii.md,
  boxSizing: 'border-box',
  color: colors.ink,
  fontSize: typography.body.fontSize,
  lineHeight: `${typography.body.lineHeight}px`,
  minHeight: 52,
  padding: `${spacing.sm}px ${spacing.md}px`,
  width: '100%',
};
