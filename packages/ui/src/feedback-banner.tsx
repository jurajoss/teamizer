import { StyleSheet, View } from 'react-native';

import { AppText } from './app-text';
import { colors, radii, spacing } from './theme';

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
  return (
    <View
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      style={[styles.container, surfaces[tone]]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.symbol, symbols[tone]]}
      >
        <AppText variant="label" style={{ color: symbolColors[tone] }}>
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
    backgroundColor: colors.surface,
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  copy: { flex: 1, gap: spacing.xxs },
});

const surfaces = StyleSheet.create({
  error: { backgroundColor: colors.errorSoft },
  success: { backgroundColor: colors.successSoft },
  info: { backgroundColor: colors.infoSoft },
  warning: { backgroundColor: colors.warningSoft },
});

const symbols = StyleSheet.create({
  error: { borderColor: colors.error, borderWidth: 1 },
  success: { borderColor: colors.success, borderWidth: 1 },
  info: { borderColor: colors.info, borderWidth: 1 },
  warning: { borderColor: colors.warning, borderWidth: 1 },
});

const symbolColors = {
  error: colors.error,
  success: colors.success,
  info: colors.info,
  warning: colors.warning,
} as const;
