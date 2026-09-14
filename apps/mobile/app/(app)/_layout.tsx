import { Redirect, Stack, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { BrandLockup, typography, useTheme } from '@teamizer/ui';

import {
  AccountAvatarButton,
  AccountMenuProvider,
} from '../../src/navigation/account-menu';
import { HeaderBackButton } from '../../src/navigation/header-controls';
import {
  authenticatedHeaderPolicy,
  authenticatedHeaderTitleAlignment,
} from '../../src/navigation/header-policy';
import { destinationForSession } from '../../src/navigation/session-navigation';
import { useSession } from '../../src/session/session-context';
import { FoundationScreen } from '../../src/ui/foundation-screen';

export default function ProtectedAppLayout() {
  const { state } = useSession();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const homeHeader = authenticatedHeaderPolicy('home');
  const innerHeader = authenticatedHeaderPolicy('inner');

  if (state.status === 'RESTORING' || state.status === 'CHECKING_IDENTITY') {
    return <FoundationScreen busy message={t('auth.restoring')} />;
  }

  if (state.status !== 'AUTHENTICATED') {
    return <Redirect href={(destinationForSession(state) ?? '/') as Href} />;
  }

  const commonOptions = {
    animation: 'slide_from_right' as const,
    contentStyle: { backgroundColor: colors.background },
    headerLeft: () => (innerHeader.showBack ? <HeaderBackButton /> : null),
    headerRight: () =>
      innerHeader.showAccount ? <AccountAvatarButton /> : null,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.accent,
    headerTitleAlign: authenticatedHeaderTitleAlignment('inner'),
    headerTitleStyle: {
      color: colors.textPrimary,
      fontSize: typography.bodyStrong.fontSize,
      fontWeight: typography.bodyStrong.fontWeight,
    },
  };

  return (
    <AccountMenuProvider>
      <Stack screenOptions={commonOptions}>
        <Stack.Screen
          name="home"
          options={{
            gestureEnabled: false,
            headerBackVisible: homeHeader.showBack,
            headerLeft: () =>
              homeHeader.showBrand ? <BrandLockup compact /> : null,
            headerRight: () =>
              homeHeader.showAccount ? <AccountAvatarButton /> : null,
            headerTitleAlign: authenticatedHeaderTitleAlignment('home'),
            headerTitle: '',
          }}
        />
        <Stack.Screen name="profile" options={{ title: t('nav.profile') }} />
        <Stack.Screen name="settings" options={{ title: t('nav.settings') }} />
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
        <Stack.Screen name="statistics" options={{ title: t('nav.ranking') }} />
        <Stack.Screen
          name="players/[playerId]"
          options={{ title: t('nav.player') }}
        />
        <Stack.Screen
          name="matches/[matchId]"
          options={{ title: t('nav.match') }}
        />
      </Stack>
    </AccountMenuProvider>
  );
}
