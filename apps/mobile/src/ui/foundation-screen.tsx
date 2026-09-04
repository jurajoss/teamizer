import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  AppText,
  BrandLockup,
  colors,
  FeedbackBanner,
  spacing,
} from '@teamizer/ui';

import { AppScreen } from './app-screen';

export function FoundationScreen({
  title = 'Getting things ready',
  message,
  busy = false,
}: {
  title?: string;
  message: string;
  busy?: boolean;
}) {
  return (
    <AppScreen centered contentStyle={styles.screen}>
      <BrandLockup />
      {busy ? (
        <View style={styles.loading}>
          <ActivityIndicator
            accessibilityLabel="Loading"
            color={colors.brand}
            size="large"
          />
          <View style={styles.copy}>
            <AppText
              accessibilityRole="header"
              style={styles.centeredText}
              variant="heading"
            >
              {title}
            </AppText>
            <AppText style={styles.centeredText} tone="muted">
              {message}
            </AppText>
          </View>
        </View>
      ) : (
        <FeedbackBanner tone="error" title={title} message={message} />
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
