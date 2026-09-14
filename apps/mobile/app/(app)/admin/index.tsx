import { Redirect, router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, spacing, Surface } from '@teamizer/ui';

import { useSession } from '../../../src/session/session-context';
import { AppScreen } from '../../../src/ui/app-screen';

export default function AdministrationRoute() {
  const { state } = useSession();
  const { t } = useTranslation();
  if (
    state.status !== 'AUTHENTICATED' ||
    state.currentUser.user.role !== 'ADMIN'
  ) {
    return <Redirect href="/home" />;
  }

  return (
    <AppScreen scroll underHeader contentStyle={styles.screen}>
      <AppText tone="muted">{t('admin.intro')}</AppText>
      <Surface tone="brand" style={styles.card}>
        <View style={styles.copy}>
          <AppText variant="heading">{t('admin.matches')}</AppText>
          <AppText tone="muted">{t('admin.matchesHint')}</AppText>
        </View>
        <Button
          label={t('admin.matches')}
          onPress={() => router.push('/admin/matches' as Href)}
        />
      </Surface>
      <Surface style={styles.card}>
        <View style={styles.copy}>
          <AppText variant="heading">{t('admin.players')}</AppText>
          <AppText tone="muted">{t('admin.playersHint')}</AppText>
        </View>
        <Button
          label={t('admin.players')}
          onPress={() => router.push('/admin/players' as Href)}
          variant="secondary"
        />
      </Surface>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  card: { gap: spacing.md },
  copy: { gap: spacing.xs },
});
