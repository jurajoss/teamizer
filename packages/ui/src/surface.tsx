import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { borderWidths, radii, spacing } from './theme';
import { useTheme } from './theme-provider';

/**
 * @deprecated Compatibility for screens that have not yet migrated. New
 * presentation should use plain layout with Divider, or Card for a genuinely
 * bounded content object. Delete Surface as the final old screen migrates.
 */
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
  const { colors, shadows } = useTheme();
  const backgroundColor =
    tone === 'default'
      ? colors.surface
      : tone === 'muted'
        ? colors.surfaceSubtle
        : colors.accentSoft;

  return (
    <View
      {...props}
      style={[
        styles.base,
        { backgroundColor, borderColor: colors.border },
        tone === 'default' && shadows.raised,
        paddings[padding],
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    borderWidth: borderWidths.subtle,
  },
});

const paddings = StyleSheet.create({
  none: { padding: 0 },
  medium: { padding: spacing.md },
  large: { padding: spacing.xl },
});
