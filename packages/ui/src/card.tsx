import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { borderWidths, radii, spacing } from './theme';
import { useTheme } from './theme-provider';

export type CardPadding = 'none' | 'compact' | 'comfortable';

/**
 * A bounded visual object, such as a Match or Player summary. Page sections do
 * not need a Card; use whitespace and Divider for ordinary document structure.
 */
export function Card({
  children,
  elevated = false,
  padding = 'comfortable',
  style,
  ...props
}: ComponentProps<typeof View> & {
  children: ReactNode;
  elevated?: boolean;
  padding?: CardPadding;
}) {
  const { colors, shadows } = useTheme();

  return (
    <View
      {...props}
      style={[
        styles.base,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
        },
        elevated && shadows.raised,
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
  compact: { padding: spacing.md },
  comfortable: { padding: spacing.xl },
});
