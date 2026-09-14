import DateTimePicker from '@react-native-community/datetimepicker';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, radii, spacing, useTheme } from '@teamizer/ui';

import { usePreferences } from '../preferences/preferences-context';

import {
  cancelNativePicker,
  confirmNativePicker,
  resolveNativePickerChange,
} from './date-time-field-state';
import {
  defaultDateTimeFieldValue,
  displayDateTimeFieldValue,
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
  const { colors, mode: themeMode } = useTheme();
  const { language } = usePreferences();
  const { t } = useTranslation();
  const initialValue = useMemo(
    () => value ?? defaultDateTimeFieldValue(mode, minimumDate),
    [minimumDate, mode, value],
  );
  const [draft, setDraft] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const isIos = Platform.OS === 'ios';

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    const result = resolveNativePickerChange(
      isIos ? 'ios' : 'android',
      event.type,
      selected,
    );
    if (result.draft) setDraft(result.draft);
    if (result.commit) onChange(result.commit);
    if (result.close) setOpen(false);
  };

  return (
    <View style={styles.field}>
      <AppText variant="label">{label}</AppText>
      <Button
        accessibilityHint={t(
          mode === 'date' ? 'dateTime.openDate' : 'dateTime.openTime',
        )}
        label={
          value
            ? displayDateTimeFieldValue(value, mode, language)
            : t(mode === 'date' ? 'dateTime.chooseDate' : 'dateTime.chooseTime')
        }
        onPress={() => {
          setDraft(value ?? defaultDateTimeFieldValue(mode, minimumDate));
          setOpen(true);
        }}
        variant="secondary"
      />
      {open ? (
        <View
          style={[
            styles.pickerSurface,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <DateTimePicker
            display={isIos ? 'spinner' : 'default'}
            mode={mode}
            onChange={handleChange}
            {...(isIos
              ? {
                  accentColor: colors.accent,
                  style: styles.iosPicker,
                  textColor: colors.textPrimary,
                  themeVariant: themeMode,
                }
              : {})}
            value={draft}
            {...(minimumDate ? { minimumDate } : {})}
          />
          {isIos ? (
            <View style={styles.iosActions}>
              <Button
                fullWidth={false}
                label={t('common.cancel')}
                onPress={() => {
                  const result = cancelNativePicker();
                  if (result.close) setOpen(false);
                }}
                variant="secondary"
              />
              <Button
                fullWidth={false}
                label={t(
                  mode === 'date' ? 'dateTime.useDate' : 'dateTime.useTime',
                )}
                onPress={() => {
                  const result = confirmNativePicker(draft);
                  if (result.commit) onChange(result.commit);
                  if (result.close) setOpen(false);
                }}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      {(error ?? hint) ? (
        <AppText variant="caption" tone={error ? 'error' : 'muted'}>
          {error ?? hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  iosActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  iosPicker: { height: 216, width: '100%' },
  pickerSurface: {
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm,
  },
});
