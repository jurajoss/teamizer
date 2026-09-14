import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';

import { AppText } from './app-text';
import { layout, radii, spacing } from './theme';
import { useTheme } from './theme-provider';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  variant = 'primary',
  busy = false,
  disabled = false,
  fullWidth = true,
  style,
  accessibilityState,
  ...props
}: Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: ButtonVariant;
  busy?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const unavailable = disabled || busy;
  const foreground =
    variant === 'primary'
      ? colors.accentContrast
      : variant === 'secondary'
        ? colors.accent
        : variant === 'danger'
          ? colors.danger
          : colors.textSecondary;
  const surface =
    variant === 'primary'
      ? { backgroundColor: colors.accent }
      : variant === 'secondary'
        ? {
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            borderWidth: 1,
          }
        : variant === 'danger'
          ? { backgroundColor: colors.dangerSurface }
          : { backgroundColor: 'transparent' };
  const pressedSurface =
    variant === 'primary'
      ? { backgroundColor: colors.accentPressed }
      : variant === 'secondary'
        ? { backgroundColor: colors.accentSoft }
        : variant === 'ghost'
          ? { backgroundColor: colors.surfaceSubtle }
          : { opacity: 0.78 };

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        disabled: unavailable,
        busy,
      }}
      disabled={unavailable}
      style={({ pressed }) => [
        styles.base,
        surface,
        fullWidth && styles.fullWidth,
        pressed && !unavailable && pressedSurface,
        unavailable && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {busy ? <ActivityIndicator color={foreground} size="small" /> : null}
        <AppText
          variant="bodyStrong"
          style={{ color: foreground }}
          numberOfLines={1}
        >
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget + 4,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.5 },
});
