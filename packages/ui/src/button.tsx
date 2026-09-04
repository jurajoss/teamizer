import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';

import { AppText } from './app-text';
import { colors, layout, radii, spacing } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  variant = 'primary',
  busy = false,
  disabled = false,
  fullWidth = true,
  style,
  ...props
}: Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: ButtonVariant;
  busy?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const unavailable = disabled || busy;
  const foreground =
    variant === 'primary' ? colors.onBrand : buttonText[variant];

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{ disabled: unavailable, busy }}
      disabled={unavailable}
      style={({ pressed }) => [
        styles.base,
        buttonSurface[variant],
        fullWidth && styles.fullWidth,
        pressed && !unavailable && pressedSurface[variant],
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

const buttonText = {
  primary: colors.onBrand,
  secondary: colors.brand,
  ghost: colors.inkMuted,
  danger: colors.error,
} as const;

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

const buttonSurface = StyleSheet.create({
  primary: { backgroundColor: colors.brand },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderWidth: 1,
  },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.errorSoft },
});

const pressedSurface = StyleSheet.create({
  primary: { backgroundColor: colors.brandPressed },
  secondary: { backgroundColor: colors.brandSoft },
  ghost: { backgroundColor: colors.surfaceMuted },
  danger: { opacity: 0.78 },
});
