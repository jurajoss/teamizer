import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  borderWidths,
  radii,
  sizes,
  spacing,
  useTheme,
} from '@teamizer/ui';

import type { Attendance } from '../api/contracts';
import { AppIcon } from '../ui/icons/app-icon';

export function AttendanceChoiceButtons({
  attendance,
  compact = false,
  disabled = false,
  pendingAttendance,
  goingAccessibilityLabel,
  notGoingAccessibilityLabel,
  onChange,
}: {
  attendance: Attendance | null;
  compact?: boolean;
  disabled?: boolean;
  pendingAttendance?: Attendance | undefined;
  goingAccessibilityLabel?: string;
  notGoingAccessibilityLabel?: string;
  onChange(attendance: Attendance): void;
}) {
  const { t } = useTranslation();

  return (
    <View style={[styles.choices, compact && styles.choicesCompact]}>
      <AttendanceChoice
        accessibilityLabel={goingAccessibilityLabel ?? t('attendance.going')}
        attendance="GOING"
        compact={compact}
        disabled={disabled}
        pending={pendingAttendance === 'GOING'}
        selected={attendance === 'GOING'}
        onPress={() => onChange('GOING')}
      />
      <AttendanceChoice
        accessibilityLabel={
          notGoingAccessibilityLabel ?? t('attendance.notGoing')
        }
        attendance="NOT_GOING"
        compact={compact}
        disabled={disabled}
        pending={pendingAttendance === 'NOT_GOING'}
        selected={attendance === 'NOT_GOING'}
        onPress={() => onChange('NOT_GOING')}
      />
    </View>
  );
}

function AttendanceChoice({
  accessibilityLabel,
  attendance,
  compact,
  disabled,
  pending,
  selected,
  onPress,
}: {
  accessibilityLabel: string;
  attendance: Attendance;
  compact: boolean;
  disabled: boolean;
  pending: boolean;
  selected: boolean;
  onPress(): void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const going = attendance === 'GOING';
  const color = going ? colors.success : colors.danger;
  const selectedForeground = colors.background;
  const foregroundColor = selected ? selectedForeground : color;
  const unavailable = disabled || pending;
  const choiceContent = pending ? (
    <ActivityIndicator color={foregroundColor} />
  ) : (
    <>
      <AppIcon
        color={foregroundColor}
        name={going ? 'complete' : 'decline'}
        size={sizes.icon.small}
      />
      {compact ? null : (
        <AppText
          numberOfLines={1}
          style={{ color: foregroundColor }}
          variant="bodyStrong"
        >
          {going ? t('attendance.going') : t('attendance.notGoing')}
        </AppText>
      )}
    </>
  );
  const surfaceStyle = [
    styles.choice,
    compact && styles.choiceCompact,
    {
      backgroundColor: selected ? color : 'transparent',
      borderColor: color,
    },
  ];

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: pending, disabled: unavailable, selected }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) =>
        compact
          ? [
              styles.compactChoiceTouchTarget,
              {
                opacity: unavailable && !pending ? 0.55 : pressed ? 0.8 : 1,
              },
            ]
          : [
              ...surfaceStyle,
              {
                opacity: unavailable && !pending ? 0.55 : pressed ? 0.8 : 1,
              },
            ]
      }
    >
      {compact ? (
        <View pointerEvents="none" style={surfaceStyle}>
          {choiceContent}
        </View>
      ) : (
        choiceContent
      )}
    </Pressable>
  );
}

export function PersonalAttendanceControl({
  attendance,
  disabled = false,
  pendingAttendance,
  onChange,
}: {
  attendance: Attendance | null;
  disabled?: boolean;
  pendingAttendance?: Attendance | undefined;
  onChange(attendance: Attendance): Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [localPendingAttendance, setLocalPendingAttendance] =
    useState<Attendance>();
  const submittingRef = useRef(false);
  const effectivePendingAttendance =
    localPendingAttendance ?? pendingAttendance;
  const pending = effectivePendingAttendance !== undefined;

  const chooseAttendance = (next: Attendance) => {
    if (next === attendance) {
      setEditing(false);
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLocalPendingAttendance(next);

    void applyPersonalAttendanceSelection(attendance, next, onChange, () =>
      setEditing(false),
    )
      .catch(() => undefined)
      .finally(() => {
        submittingRef.current = false;
        setLocalPendingAttendance(undefined);
      });
  };

  return (
    <PersonalAttendanceContent
      attendance={attendance}
      disabled={disabled || pending}
      editing={editing}
      pendingAttendance={effectivePendingAttendance}
      onChange={chooseAttendance}
      onEdit={() => setEditing(true)}
    />
  );
}

export function PersonalAttendanceContent({
  attendance,
  disabled,
  editing,
  pendingAttendance,
  onChange,
  onEdit,
}: {
  attendance: Attendance | null;
  disabled: boolean;
  editing: boolean;
  pendingAttendance?: Attendance | undefined;
  onChange(attendance: Attendance): void;
  onEdit(): void;
}) {
  if (attendance === null || editing) {
    return (
      <AttendanceChoiceButtons
        attendance={attendance}
        disabled={disabled}
        pendingAttendance={pendingAttendance}
        onChange={onChange}
      />
    );
  }

  return (
    <AttendanceStatusRow
      attendance={attendance}
      disabled={disabled}
      onEdit={onEdit}
    />
  );
}

export async function applyPersonalAttendanceSelection(
  current: Attendance | null,
  next: Attendance,
  onChange: (attendance: Attendance) => Promise<void> | void,
  onSuccess: () => void,
): Promise<'UNCHANGED' | 'UPDATED'> {
  if (next === current) {
    onSuccess();
    return 'UNCHANGED';
  }

  await onChange(next);
  onSuccess();
  return 'UPDATED';
}

export function AttendanceStatusRow({
  attendance,
  disabled = false,
  onEdit,
}: {
  attendance: Attendance;
  disabled?: boolean;
  onEdit(): void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const going = attendance === 'GOING';
  const editColor = disabled ? colors.textDisabled : colors.accent;

  return (
    <View style={[styles.statusRow, { borderColor: colors.border }]}>
      <View style={styles.statusLabel}>
        <AppIcon
          color={going ? colors.success : colors.danger}
          name={going ? 'complete' : 'decline'}
          size={sizes.icon.small}
        />
        <AppText variant="bodyStrong">
          {going ? t('attendance.going') : t('attendance.notGoing')}
        </AppText>
      </View>
      <Pressable
        accessibilityHint={t('attendance.editPlayerHint')}
        accessibilityLabel={t('attendance.edit')}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onEdit}
        style={({ pressed }) => [
          styles.editAction,
          pressed && !disabled && { backgroundColor: colors.accentSoft },
        ]}
      >
        <AppIcon color={editColor} name="edit" size={sizes.icon.small} />
        <AppText style={{ color: editColor }} variant="label">
          {t('attendance.edit')}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', gap: spacing.sm },
  choicesCompact: {
    flex: 0,
    gap: 0,
    width: sizes.minimumTouchTarget * 2,
  },
  choice: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: borderWidths.subtle,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: sizes.controlHeight,
    paddingHorizontal: spacing.sm,
  },
  choiceCompact: {
    borderRadius: radii.sm,
    flex: 0,
    gap: 0,
    height: sizes.compactControl + spacing.xxs,
    minHeight: sizes.compactControl + spacing.xxs,
    paddingHorizontal: 0,
    width: sizes.compactControl + spacing.xxs,
  },
  compactChoiceTouchTarget: {
    alignItems: 'center',
    flex: 0,
    height: sizes.minimumTouchTarget,
    justifyContent: 'center',
    width: sizes.minimumTouchTarget,
  },
  statusRow: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: borderWidths.subtle,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: sizes.controlHeight,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xxs,
    width: '100%',
  },
  statusLabel: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  editAction: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.xxs,
    minHeight: sizes.minimumTouchTarget,
    paddingHorizontal: spacing.xs,
  },
});
