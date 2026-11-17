import { Redirect, router, Stack, usePathname, type Href } from 'expo-router';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

import { typography, useTheme } from '@teamizer/ui';

import {
  AccountAvatarButton,
  AccountMenuProvider,
} from '../../src/navigation/account-menu';
import { AuthenticatedAppShell } from '../../src/navigation/authenticated-app-shell';
import {
  HeaderBackButton,
  HeaderIconAction,
} from '../../src/navigation/header-controls';
import {
  authenticatedHeaderPolicy,
  authenticatedHeaderTitleAlignment,
  homeNativeHeaderTitle,
  nestedBackFallback,
} from '../../src/navigation/header-policy';
import {
  iosAccountHeaderItems,
  iosContextualHeaderItems,
  iosNestedBackItems,
} from '../../src/navigation/native-header-items';
import { canCreateMatch } from '../../src/matches/matches-index-model';
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
  const pathname = usePathname();
  const primaryHeader = authenticatedHeaderPolicy('primary');
  const nestedHeader = authenticatedHeaderPolicy('nested');
  const usesIosNativeItems = Platform.OS === 'ios';

  if (state.status === 'RESTORING' || state.status === 'CHECKING_IDENTITY') {
    return <FoundationScreen busy message={t('auth.restoring')} />;
  }

  if (state.status !== 'AUTHENTICATED') {
    return <Redirect href={(destinationForSession(state) ?? '/') as Href} />;
  }

  const primaryOptions = (title: string) => ({
    gestureEnabled: false,
    headerBackVisible: primaryHeader.showBack,
    headerTitleAlign: authenticatedHeaderTitleAlignment('primary', Platform.OS),
    title,
    ...(usesIosNativeItems
      ? {
          unstable_headerLeftItems: () =>
            primaryHeader.showAccount ? iosAccountHeaderItems() : [],
          unstable_headerRightItems: () => [],
        }
      : {
          headerLeft: () =>
            primaryHeader.showAccount ? <AccountAvatarButton /> : null,
          headerRight: () => null,
        }),
  });
  const mayCreateMatch = canCreateMatch(state.currentUser.user.role);
  const createMatch = () => router.push('/admin/matches/create');

  return (
    <AccountMenuProvider>
      <AuthenticatedAppShell>
        <Stack
          screenOptions={{
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: colors.background },
            headerBackButtonDisplayMode: 'generic',
            headerBackTitle: t('common.back'),
            headerBackVisible: nestedHeader.showBack,
            headerLeft: ({ canGoBack }) =>
              !usesIosNativeItems && nestedHeader.showBack && !canGoBack ? (
                <HeaderBackButton />
              ) : null,
            headerRight: () => null,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.accent,
            headerTitleAlign: authenticatedHeaderTitleAlignment(
              'nested',
              Platform.OS,
            ),
            headerTitleStyle: {
              color: colors.textPrimary,
              fontSize: typography.bodyStrong.fontSize,
              fontWeight: typography.bodyStrong.fontWeight,
            },
            ...(usesIosNativeItems
              ? {
                  unstable_headerLeftItems: ({ canGoBack }) =>
                    iosNestedBackItems({
                      canGoBack,
                      colors,
                      label: t('common.back'),
                      onFallback: () =>
                        router.replace(nestedBackFallback(pathname) as Href),
                    }),
                  unstable_headerRightItems: () => [],
                }
              : {}),
          }}
        >
          <Stack.Screen
            name="home"
            options={{
              ...primaryOptions(homeNativeHeaderTitle),
            }}
          />
          <Stack.Screen
            name="matches/index"
            options={{
              ...primaryOptions(t('nav.matches')),
              ...(usesIosNativeItems
                ? {
                    unstable_headerRightItems: () =>
                      iosContextualHeaderItems({
                        icon: 'add',
                        label: t('matchesIndex.create'),
                        ...(mayCreateMatch ? { onPress: createMatch } : {}),
                      }),
                  }
                : {
                    headerRight: () =>
                      mayCreateMatch ? (
                        <HeaderIconAction
                          icon="add"
                          label={t('matchesIndex.create')}
                          onPress={createMatch}
                        />
                      ) : null,
                  }),
            }}
          />
          <Stack.Screen
            name="rankings"
            options={{
              ...primaryOptions(t('nav.rankings')),
            }}
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
            options={{ title: t('playerDetail.title') }}
          />
          <Stack.Screen
            name="players/[playerId]/edit"
            options={{ title: t('nav.editProfile') }}
          />
          <Stack.Screen
            name="players/[playerId]/matches"
            options={{ title: t('playerDetail.historyTitle') }}
          />
          <Stack.Screen
            name="matches/[matchId]"
            options={{ title: t('nav.match') }}
          />
          <Stack.Screen
            name="matches/[matchId]/edit-teams"
            options={{ title: t('teams.editTitle') }}
          />
          <Stack.Screen
            name="matches/[matchId]/edit-participants"
            options={{
              title: t('attendance.editParticipants'),
            }}
          />
        </Stack>
      </AuthenticatedAppShell>
    </AccountMenuProvider>
  );
}
