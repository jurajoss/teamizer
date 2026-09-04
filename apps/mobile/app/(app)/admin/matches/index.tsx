import { Redirect, router } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  BrandLockup,
  Button,
  spacing,
  StatusPill,
  Surface,
} from '@teamizer/ui';

import { canAccessMatchAdministration } from '../../../../src/matches/admin-match-management';
import { useSession } from '../../../../src/session/session-context';
import { AppScreen } from '../../../../src/ui/app-screen';

export default function AdminMatchManagementRoute() {
  const { state } = useSession();

  if (
    state.status !== 'AUTHENTICATED' ||
    !canAccessMatchAdministration(state.currentUser.user.role)
  ) {
    return <Redirect href="/home" />;
  }

  return (
    <AppScreen scroll contentStyle={styles.screen}>
      <View style={styles.topBar}>
        <BrandLockup compact />
        <Button
          fullWidth={false}
          label="Back"
          onPress={returnHome}
          variant="ghost"
        />
      </View>
      <View style={styles.heading}>
        <StatusPill label="ADMIN" tone="info" />
        <AppText accessibilityRole="header" variant="title">
          Match management
        </AppText>
        <AppText tone="muted">
          Create a one-off Match or maintain the weekly recurring setup.
        </AppText>
      </View>

      <Surface tone="brand" style={styles.card}>
        <View style={styles.cardCopy}>
          <AppText variant="eyebrow" tone="brand">
            ONE-OFF
          </AppText>
          <AppText variant="heading">Create Match</AppText>
          <AppText tone="muted">
            Choose a Sport, Prague date and time, and location. Registration
            opens immediately.
          </AppText>
        </View>
        <Button
          label="Create a Match"
          onPress={() => router.push('/admin/matches/create' as Href)}
        />
      </Surface>

      <Surface style={styles.card}>
        <View style={styles.cardCopy}>
          <AppText variant="eyebrow" tone="brand">
            RECURRING
          </AppText>
          <AppText variant="heading">Recurring Schedule</AppText>
          <AppText tone="muted">
            Manage the weekly occurrence and reminder timing used by the
            existing scheduler.
          </AppText>
        </View>
        <Button
          label="Manage recurring Schedule"
          onPress={() => router.push('/admin/matches/schedule' as Href)}
          variant="secondary"
        />
      </Surface>
    </AppScreen>
  );
}

function returnHome(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

const styles = StyleSheet.create({
  screen: { gap: spacing.xxl },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heading: { gap: spacing.sm, marginTop: spacing.lg, maxWidth: 620 },
  card: { gap: spacing.lg },
  cardCopy: { gap: spacing.xs },
});
