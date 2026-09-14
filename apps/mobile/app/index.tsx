import { Redirect, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  BrandLockup,
  Button,
  FeedbackBanner,
  spacing,
} from '@teamizer/ui';

import { destinationForSession } from '../src/navigation/session-navigation';
import { useSession } from '../src/session/session-context';
import { AppScreen } from '../src/ui/app-screen';
import { FoundationScreen } from '../src/ui/foundation-screen';

export default function SessionEntryScreen() {
  const { t } = useTranslation();
  const { state, retry, signOut } = useSession();
  const destination = destinationForSession(state);

  if (destination) {
    return <Redirect href={destination as Href} />;
  }

  if (state.status !== 'ERROR') {
    return (
      <FoundationScreen
        busy
        message={
          state.status === 'RESTORING'
            ? t('auth.restoring')
            : t('auth.checking')
        }
      />
    );
  }

  return (
    <AppScreen centered contentStyle={styles.screen}>
      <BrandLockup />
      <View style={styles.copy}>
        <AppText accessibilityRole="header" variant="title">
          {t('auth.recoveryTitle')}
        </AppText>
        <AppText tone="muted">{t('auth.recoveryText')}</AppText>
      </View>
      <FeedbackBanner
        tone="error"
        title={t('auth.unable')}
        message={t('errors.generic')}
      />
      <View style={styles.actions}>
        <Button
          label={t('common.retry')}
          onPress={retry}
          testID="session-retry-button"
        />
        <Button
          label={t('common.signOut')}
          onPress={() => void signOut().catch(() => undefined)}
          variant="secondary"
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.xxl,
    maxWidth: 460,
  },
  copy: {
    gap: spacing.xs,
  },
  actions: { gap: spacing.sm },
});
