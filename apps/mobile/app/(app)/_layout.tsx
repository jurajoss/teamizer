import { Redirect, Stack, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { typography, useTheme } from '@teamizer/ui';

import {
  AccountAvatarButton,
  AccountMenuProvider,
} from '../../src/navigation/account-menu';
import { AuthenticatedAppShell } from '../../src/navigation/authenticated-app-shell';
import { HeaderBackButton } from '../../src/navigation/header-controls';
import {
  authenticatedHeaderPolicy,
  authenticatedHeaderTitleAlignment,
} from '../../src/navigation/header-policy';
import { destinationForSession } from '../../src/navigation/session-navigation';
import { useSession } from '../../src/session/session-context';
import { FoundationScreen } from '../../src/ui/foundation-screen';

export const unstable_settings = {
  initialRouteName: 'home',
};

export default function ProtectedAppLayout() {
  const { state } = useSession();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const primaryHeader = authenticatedHeaderPolicy('primary');
  const nestedHeader = authenticatedHeaderPolicy('nested');

  if (state.status === 'RESTORING' || state.status === 'CHECKING_IDENTITY') {
    return <FoundationScreen busy message={t('auth.restoring')} />;
  }

  if (state.status !== 'AUTHENTICATED') {
    return <Redirect href={(destinationForSession(state) ?? '/') as Href} />;
  }

  const primaryOptions = (title: string) => ({
    gestureEnabled: false,
    headerBackVisible: primaryHeader.showBack,
    headerLeft: () => null,
    headerRight: () =>
      primaryHeader.showAccount ? <AccountAvatarButton /> : null,
    headerTitleAlign: authenticatedHeaderTitleAlignment('primary'),
    title,
  });

  return (
    <AccountMenuProvider>
      <AuthenticatedAppShell>
        <Stack
          screenOptions={{
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: colors.background },
            headerBackVisible: false,
            headerLeft: () =>
              nestedHeader.showBack ? <HeaderBackButton /> : null,
            headerRight: () =>
              nestedHeader.showAccount ? <AccountAvatarButton /> : null,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.accent,
            headerTitleAlign: authenticatedHeaderTitleAlignment('nested'),
            headerTitleStyle: {
              color: colors.textPrimary,
              fontSize: typography.bodyStrong.fontSize,
              fontWeight: typography.bodyStrong.fontWeight,
            },
          }}
        >
          <Stack.Screen name="home" options={primaryOptions(t('nav.home'))} />
          <Stack.Screen
            name="matches/index"
            options={primaryOptions(t('nav.matches'))}
          />
          <Stack.Screen
            name="players/index"
            options={primaryOptions(t('nav.players'))}
          />
          <Stack.Screen
            name="statistics"
            options={primaryOptions(t('nav.statistics'))}
          />
          <Stack.Screen name="profile" options={{ title: t('nav.profile') }} />
          <Stack.Screen
            name="settings"
            options={{ title: t('nav.settings') }}
          />
          <Stack.Screen
            name="admin/index"
            options={{ title: t('nav.administration') }}
          />
          <Stack.Screen
            name="admin/players/index"
            options={{ title: t('nav.managePlayers') }}
          />
          <Stack.Screen
            name="admin/players/[playerId]"
            options={{ title: t('nav.playerDetails') }}
          />
          <Stack.Screen
            name="admin/matches/index"
            options={{ title: t('nav.manageMatches') }}
          />
          <Stack.Screen
            name="admin/matches/create"
            options={{ title: t('nav.createMatch') }}
          />
          <Stack.Screen
            name="admin/matches/schedule"
            options={{ title: t('nav.schedule') }}
          />
          <Stack.Screen
            name="players/[playerId]"
            options={{ title: t('nav.player') }}
          />
          <Stack.Screen
            name="matches/[matchId]"
            options={{ title: t('nav.match') }}
          />
        </Stack>
      </AuthenticatedAppShell>
    </AccountMenuProvider>
  );
}
