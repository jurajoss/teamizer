import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { AppText } from './app-text';
import { buttonColorSet, type ButtonVariant } from './button-state';
import { borderWidths, radii, sizes, spacing } from './theme';
import { useTheme } from './theme-provider';

export type { ButtonVariant } from './button-state';

export function Button({
  label,
  variant = 'primary',
  busy = false,
  disabled = false,
  fullWidth = true,
  icon,
  style,
  accessibilityState,
  ...props
}: Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: ButtonVariant;
  busy?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const unavailable = disabled || busy;
  const defaultColors = buttonColorSet(
    colors,
    variant,
    unavailable ? 'disabled' : 'default',
  );
  const pressedColors = buttonColorSet(colors, variant, 'pressed');

  return (
    <Pressable
      {...props}
      accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        disabled: unavailable,
        busy,
      }}
      disabled={unavailable}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: defaultColors.background,
          borderColor: defaultColors.border,
        },
        fullWidth && styles.fullWidth,
        pressed &&
          !unavailable && {
            backgroundColor: pressedColors.background,
            borderColor: pressedColors.border,
          },
        style,
      ]}
    >
      <View style={styles.content}>
        {icon && !busy ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {icon}
          </View>
        ) : null}
        {busy ? (
          <ActivityIndicator
            accessibilityElementsHidden
            color={defaultColors.foreground}
            importantForAccessibility="no-hide-descendants"
            size="small"
          />
        ) : null}
        <AppText
          variant="bodyStrong"
          style={[styles.label, { color: defaultColors.foreground }]}
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
    borderWidth: borderWidths.subtle,
    justifyContent: 'center',
    minHeight: sizes.controlHeight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: spacing.xs,
    justifyContent: 'center',
  },
  label: { textAlign: 'center' },
  fullWidth: { width: '100%' },
});
