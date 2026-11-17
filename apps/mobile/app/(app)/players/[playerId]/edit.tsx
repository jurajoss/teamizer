import { useLocalSearchParams } from 'expo-router';

import { PlayerProfileEditScreen } from '../../../../src/profiles/player-profile-edit-screen';

export default function PlayerProfileEditRoute() {
  const parameters = useLocalSearchParams<{
    playerId?: string | string[];
  }>();
  const playerId =
    typeof parameters.playerId === 'string' ? parameters.playerId : '';

  return <PlayerProfileEditScreen playerId={playerId} />;
}
