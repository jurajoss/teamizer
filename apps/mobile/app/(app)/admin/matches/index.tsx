import { Redirect, router } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, spacing, Surface } from '@teamizer/ui';

import { canAccessMatchAdministration } from '../../../../src/matches/admin-match-management';
import { useSession } from '../../../../src/session/session-context';
import { AppScreen } from '../../../../src/ui/app-screen';

export default function AdminMatchManagementRoute() {
  const { t } = useTranslation();
  const { state } = useSession();

  if (
    state.status !== 'AUTHENTICATED' ||
    !canAccessMatchAdministration(state.currentUser.user.role)
  ) {
    return <Redirect href="/home" />;
  }

  return (
    <AppScreen scroll underHeader contentStyle={styles.screen}>
      <Surface tone="brand" style={styles.card}>
        <View style={styles.cardCopy}>
          <AppText variant="eyebrow" tone="brand">
            {t('admin.oneOff').toUpperCase()}
          </AppText>
          <AppText variant="heading">{t('admin.createMatch')}</AppText>
          <AppText tone="muted">{t('admin.createMatchHint')}</AppText>
        </View>
        <Button
          label={t('admin.createMatch')}
          onPress={() => router.push('/admin/matches/create' as Href)}
        />
      </Surface>

      <Surface style={styles.card}>
        <View style={styles.cardCopy}>
          <AppText variant="eyebrow" tone="brand">
            {t('admin.recurring').toUpperCase()}
          </AppText>
          <AppText variant="heading">{t('admin.recurringSchedule')}</AppText>
          <AppText tone="muted">{t('admin.recurringHint')}</AppText>
        </View>
        <Button
          label={t('admin.manageSchedule')}
          onPress={() => router.push('/admin/matches/schedule' as Href)}
          variant="secondary"
        />
      </Surface>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  card: { gap: spacing.md },
  cardCopy: { gap: spacing.xs },
});
