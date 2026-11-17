import { useLocalSearchParams } from 'expo-router';

import { ParticipantEditorScreen } from '../../../../src/matches/participant-editor-screen';

export default function EditParticipantsRoute() {
  const parameters = useLocalSearchParams<{ matchId?: string | string[] }>();
  const matchId =
    typeof parameters.matchId === 'string' ? parameters.matchId : null;

  if (!matchId) return null;

  return <ParticipantEditorScreen matchId={matchId} />;
}
