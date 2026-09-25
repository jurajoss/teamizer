import { StyleSheet, View } from 'react-native';

import { AppText } from './app-text';
import { statusColorSet, type StatusTone } from './status-colors';
import { borderWidths, radii, spacing } from './theme';
import { useTheme } from './theme-provider';

export type { StatusTone } from './status-colors';

export function StatusPill({
  label,
  tone = 'success',
}: {
  label: string;
  tone?: StatusTone;
}) {
  const { colors } = useTheme();
  const toneColors = statusColorSet(colors, tone);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: toneColors.background,
          borderColor: toneColors.border,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: toneColors.foreground }]} />
      <AppText variant="eyebrow" style={{ color: toneColors.foreground }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    borderWidth: borderWidths.subtle,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  dot: { borderRadius: 4, height: 8, width: 8 },
});
