import { StyleSheet, View } from 'react-native';

import { AppText } from './app-text';
import { radii, spacing } from './theme';
import { useTheme } from './theme-provider';

export type FeedbackTone = 'error' | 'success' | 'info' | 'warning';

export function FeedbackBanner({
  tone,
  title,
  message,
}: {
  tone: FeedbackTone;
  title?: string;
  message: string;
}) {
  const { colors } = useTheme();
  const toneColor = {
    error: colors.danger,
    success: colors.success,
    info: colors.info,
    warning: colors.warning,
  }[tone];
  const surfaceColor = {
    error: colors.dangerSurface,
    success: colors.successSurface,
    info: colors.infoSurface,
    warning: colors.warningSurface,
  }[tone];

  return (
    <View
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      style={[styles.container, { backgroundColor: surfaceColor }]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.symbol,
          { backgroundColor: colors.surface, borderColor: toneColor },
        ]}
      >
        <AppText variant="label" style={{ color: toneColor }}>
          {tone === 'error' ? '!' : tone === 'success' ? '✓' : 'i'}
        </AppText>
      </View>
      <View style={styles.copy}>
        {title ? <AppText variant="bodyStrong">{title}</AppText> : null}
        <AppText variant="caption" tone="muted">
          {message}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  symbol: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  copy: { flex: 1, gap: spacing.xxs },
});
