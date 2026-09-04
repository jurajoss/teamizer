import { StyleSheet, View } from 'react-native';

import { AppText } from './app-text';
import { colors, radii, spacing } from './theme';

export function StatusPill({
  label,
  tone = 'success',
}: {
  label: string;
  tone?: 'success' | 'info' | 'neutral';
}) {
  return (
    <View style={[styles.container, surfaces[tone]]}>
      <View style={[styles.dot, dots[tone]]} />
      <AppText variant="eyebrow" style={{ color: textColors[tone] }}>
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

const surfaces = StyleSheet.create({
  success: { backgroundColor: colors.successSoft },
  info: { backgroundColor: colors.infoSoft },
  neutral: { backgroundColor: colors.surfaceMuted },
});

const dots = StyleSheet.create({
  success: { backgroundColor: colors.success },
  info: { backgroundColor: colors.info },
  neutral: { backgroundColor: colors.inkSubtle },
});

const textColors = {
  success: colors.success,
  info: colors.info,
  neutral: colors.inkMuted,
} as const;
