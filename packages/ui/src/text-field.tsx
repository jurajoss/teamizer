import type { ComponentProps } from 'react';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { AppText } from './app-text';
import { borderWidths, radii, sizes, spacing, typography } from './theme';
import { useTheme } from './theme-provider';

export function TextField({
  label,
  hint,
  error,
  containerStyle,
  style,
  onFocus,
  onBlur,
  ...props
}: ComponentProps<typeof TextInput> & {
  label: string;
  hint?: string;
  error?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const supportingText = error ?? hint;

  return (
    <View style={[styles.container, containerStyle]}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        accessibilityHint={error ?? props.accessibilityHint}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        placeholderTextColor={colors.textSubtle}
        selectionColor={colors.accent}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            color: colors.textPrimary,
          },
          focused && styles.focused,
          focused && { borderColor: colors.focus },
          Boolean(error) && { borderColor: colors.danger },
          style,
        ]}
      />
      {supportingText ? (
        <AppText variant="caption" tone={error ? 'error' : 'muted'}>
          {supportingText}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  input: {
    borderRadius: radii.md,
    borderWidth: borderWidths.subtle,
    minHeight: sizes.controlHeight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
  },
  focused: {
    borderWidth: borderWidths.emphasized,
    paddingHorizontal: spacing.md - 1,
    paddingVertical: spacing.sm - 1,
  },
});
