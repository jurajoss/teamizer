import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  AppText,
  BrandLockup,
  FeedbackBanner,
  spacing,
  useTheme,
} from '@teamizer/ui';
import { useTranslation } from 'react-i18next';

import { AppScreen } from './app-screen';

export function FoundationScreen({
  title,
  message,
  busy = false,
}: {
  title?: string;
  message: string;
  busy?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <AppScreen centered contentStyle={styles.screen}>
      <BrandLockup />
      {busy ? (
        <View style={styles.loading}>
          <ActivityIndicator
            accessibilityLabel={t('common.loading')}
            color={colors.accent}
            size="large"
          />
          <View style={styles.copy}>
            <AppText
              accessibilityRole="header"
              style={styles.centeredText}
              variant="heading"
            >
              {title ?? t('foundation.ready')}
            </AppText>
            <AppText style={styles.centeredText} tone="muted">
              {message}
            </AppText>
          </View>
        </View>
      ) : (
        <FeedbackBanner
          tone="error"
          title={title ?? t('foundation.ready')}
          message={message}
        />
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.xxl,
    maxWidth: 460,
  },
  loading: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  copy: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  centeredText: { textAlign: 'center' },
});
