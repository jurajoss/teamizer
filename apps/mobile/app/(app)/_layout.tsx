import { Redirect, Stack, type Href } from 'expo-router';

import { colors } from '@teamizer/ui';

import { destinationForSession } from '../../src/navigation/session-navigation';
import { useSession } from '../../src/session/session-context';
import { FoundationScreen } from '../../src/ui/foundation-screen';

export default function ProtectedAppLayout() {
  const { state } = useSession();

  if (state.status === 'RESTORING' || state.status === 'CHECKING_IDENTITY') {
    return <FoundationScreen busy message="Restoring your secure session…" />;
  }

  if (state.status !== 'AUTHENTICATED') {
    return <Redirect href={(destinationForSession(state) ?? '/') as Href} />;
  }

  return (
    <Stack
      screenOptions={{
        animation: 'fade',
        contentStyle: { backgroundColor: colors.canvas },
        headerShown: false,
      }}
    >
      <Stack.Screen name="home" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="admin/players/index" />
      <Stack.Screen name="admin/players/[playerId]" />
      <Stack.Screen name="admin/matches/index" />
      <Stack.Screen name="admin/matches/create" />
      <Stack.Screen name="admin/matches/schedule" />
      <Stack.Screen name="statistics" />
      <Stack.Screen name="players/[playerId]" />
      <Stack.Screen name="matches/[matchId]" />
    </Stack>
  );
}
