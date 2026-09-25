import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { borderWidths } from './theme';
import { useTheme } from './theme-provider';

/** A quiet boundary between related rows or sections. */
export function Divider({ style, ...props }: ComponentProps<typeof View>) {
  const { colors } = useTheme();

  return (
    <View
      {...props}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.divider, { backgroundColor: colors.border }, style]}
    />
  );
}

const styles = StyleSheet.create({
  divider: {
    height: borderWidths.subtle,
    width: '100%',
  },
});
