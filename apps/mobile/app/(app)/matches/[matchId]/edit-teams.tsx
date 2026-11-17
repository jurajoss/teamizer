import { useLocalSearchParams } from 'expo-router';

import { TeamEditorScreen } from '../../../../src/matches/team-editor-screen';

export default function EditTeamsRoute() {
  const parameters = useLocalSearchParams<{ matchId?: string | string[] }>();
  const matchId =
    typeof parameters.matchId === 'string' ? parameters.matchId : null;

  if (!matchId) return null;

  return <TeamEditorScreen matchId={matchId} />;
}
