import { StyleSheet, View } from 'react-native';

import { AppText } from './app-text';
import { radii, spacing } from './theme';
import { useTheme } from './theme-provider';

export function StatusPill({
  label,
  tone = 'success',
}: {
  label: string;
  tone?: 'success' | 'info' | 'neutral';
}) {
  const { colors } = useTheme();
  const toneColors = {
    success: { surface: colors.successSurface, text: colors.success },
    info: { surface: colors.infoSurface, text: colors.info },
    neutral: { surface: colors.surfaceSubtle, text: colors.textSecondary },
  }[tone];

  return (
    <View style={[styles.container, { backgroundColor: toneColors.surface }]}>
      <View style={[styles.dot, { backgroundColor: toneColors.text }]} />
      <AppText variant="eyebrow" style={{ color: toneColors.text }}>
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
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  dot: { borderRadius: 4, height: 8, width: 8 },
});
