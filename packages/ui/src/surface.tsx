import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radii, shadows, spacing } from './theme';

export function Surface({
  children,
  tone = 'default',
  padding = 'large',
  style,
  ...props
}: ComponentProps<typeof View> & {
  children: ReactNode;
  tone?: 'default' | 'muted' | 'brand';
  padding?: 'none' | 'medium' | 'large';
}) {
  return (
    <View
      {...props}
      style={[styles.base, surfaces[tone], paddings[padding], style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
});

const surfaces = StyleSheet.create({
  default: { backgroundColor: colors.surface, ...shadows.raised },
  muted: { backgroundColor: colors.surfaceMuted },
  brand: { backgroundColor: colors.brandSoft },
});

const paddings = StyleSheet.create({
  none: { padding: 0 },
  medium: { padding: spacing.md },
  large: { padding: spacing.xl },
});
